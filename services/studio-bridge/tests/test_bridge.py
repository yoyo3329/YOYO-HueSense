"""Protocol tests use an explicit test double, never evidence of actual model inference."""
import base64
import hashlib
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import BridgeServer, validate_prompt, decode_image, encode_runs
from models import check_sam_snapshot


class ModelTestDouble:
    def health(self):
        return {'sam2': {'ready': True}, 'openclip': {'ready': True}, 'model_identity_verified': False}
    def segment(self, image, points, box):
        mask = np.zeros((image.height, image.width), dtype=bool)
        mask[1:3, 1:3] = True
        return mask, .75
    def score(self, image, texts):
        return [{'text': text, 'cosine_similarity': .2} for text in texts]


class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        Path(cls.tmp.name, 'index.html').write_text('studio')
        cls.server = BridgeServer(('127.0.0.1', 0), cls.tmp.name, ModelTestDouble(), 'test-only-token')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        buf = io.BytesIO(); Image.new('RGB', (4, 4), 'red').save(buf, format='PNG')
        cls.image = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.tmp.cleanup()

    def call(self, path, payload=None, token=True, extra=None):
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        headers = {'Content-Type': 'application/json'}
        if token: headers['Authorization'] = 'Bearer test-only-token'
        headers.update(extra or {})
        c.request('POST' if payload is not None else 'GET', path,
                  json.dumps(payload) if payload is not None else None, headers)
        res = c.getresponse(); code = res.status; data = res.read(); c.close()
        return code, json.loads(data)

    def test_health_requires_token(self):
        self.assertEqual(self.call('/api/health', token=False)[0], 401)
        code, data = self.call('/api/health')
        self.assertEqual(code, 200)
        self.assertFalse(data['model_identity_verified'])

    def test_cross_origin_and_rebinding_blocked(self):
        self.assertEqual(self.call('/api/health', extra={'Origin':'https://malicious.invalid'})[0], 403)
        self.assertEqual(self.call('/api/health', extra={'Host':'malicious.invalid'})[0], 403)

    def test_prompt_validation(self):
        validate_prompt({'points':[{'x':.5,'y':.5,'label':1}]})
        validate_prompt({'box':[0,0,1,1]})
        for payload in [{'points':[]}, {'points':[{'x':2,'y':0,'label':1}]},
                        {'points':[{'x':0,'y':0,'label':0}]}, {'box':[.8,0,.2,1]},
                        {'points':[{'x':float('nan'),'y':0,'label':1}]}]:
            with self.assertRaises(ValueError): validate_prompt(payload)

    def test_segment_contract_and_rle(self):
        code, data = self.call('/api/segment', {'request_id':'a', 'image':self.image,
                                             'points':[{'x':.5,'y':.5,'label':1}]})
        self.assertEqual(code, 200); self.assertEqual(data['request_id'], 'a')
        self.assertTrue(data['requires_confirmation'])
        flat = np.zeros(16, dtype=bool)
        for start, length in data['mask']['runs']: flat[start:start+length] = True
        self.assertEqual(int(flat.sum()), 4)
        self.assertEqual(data['mask']['width'], 4)
        self.assertEqual(encode_runs(np.ones((1, 4), dtype=bool)), [[0,4]])
        self.assertEqual(encode_runs(np.zeros((2, 2), dtype=bool)), [])

    def test_scoring_has_no_truth_authority(self):
        code, data = self.call('/api/score', {'request_id':'s','image':self.image,'texts':['red object']})
        self.assertEqual(code, 200); self.assertFalse(data['truth_claim'])
        self.assertEqual(data['score_semantics'], 'CLIP_COSINE_NOT_PROBABILITY')

    def test_model_error_and_busy_do_not_fake_masks(self):
        payload = {'request_id':'err','image':self.image,'box':[0,0,1,1]}
        with patch.object(self.server.models, 'segment', side_effect=RuntimeError('no model')):
            code, data = self.call('/api/segment', payload)
            self.assertEqual(code, 503); self.assertNotIn('mask', data)
        self.server.inference_lock.acquire()
        try: self.assertEqual(self.call('/api/segment', payload)[0], 429)
        finally: self.server.inference_lock.release()

    def test_no_image_url_fetch_and_invalid_json_shape(self):
        with self.assertRaises(ValueError): decode_image('http://127.0.0.1/private')
        self.assertEqual(self.call('/api/score', [1,2])[0], 400)
        self.assertEqual(self.call('/api/score', {'request_id':'x','image':self.image,'texts':[]})[0], 400)

    def test_local_weight_mismatch_fails(self):
        snapshot = Path(self.tmp.name, 'revision'); snapshot.mkdir(exist_ok=True)
        (snapshot / 'model.safetensors').write_bytes(b'test')
        lock = {'certified':True,'resolved_revision':'revision','weight_files':[
            {'name':'model.safetensors','size':4,'sha256':hashlib.sha256(b'test').hexdigest()}]}
        self.assertEqual(check_sam_snapshot(lock, snapshot), snapshot)
        (snapshot / 'model.safetensors').write_bytes(b'fail')
        with self.assertRaises(RuntimeError): check_sam_snapshot(lock, snapshot)


if __name__ == '__main__': unittest.main()
