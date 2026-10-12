"""Pure contract tests, NO fake 'real model success'. Run with system Python; PIL/torch unnecessary."""
import base64
import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import validate_prompt, decode_image, MAX_PIXELS
from sam_backend import encode_runs, REVISION, HASH

class RequestTests(unittest.TestCase):
    def test_positive_click(self):
        rid,pts,box=validate_prompt({"request_id":"1","points":[{"x":.3,"y":.7,"label":1}]})
        self.assertEqual((rid,len(pts),box),("1",1,None))
    def test_negative_plus_positive(self):
        _,pts,_=validate_prompt({"request_id":"1","points":[{"x":.3,"y":.7,"label":1},{"x":.2,"y":.1,"label":0}]})
        self.assertEqual([p["label"] for p in pts],[1,0])
    def test_box_only(self):
        _,_,box=validate_prompt({"request_id":"2","box":[.1,.2,.8,.9]})
        self.assertEqual(len(box),4)
    def test_reject_negative_only(self):
        with self.assertRaises(ValueError):
            validate_prompt({"request_id":"2","points":[{"x":.1,"y":.2,"label":0}]})
    def test_reject_invalid_coords(self):
        for x in [float("nan"),float("inf"),-0.1,1.1,True]:
            with self.subTest(x=x):
                with self.assertRaises(ValueError):
                    validate_prompt({"request_id":"2","points":[{"x":x,"y":0,"label":1}]})
    def test_reject_box_inversion(self):
        with self.assertRaises(ValueError):
            validate_prompt({"request_id":"2","box":[.8,.2,.1,.9]})
    def test_reject_photo_url(self):
        with self.assertRaises(ValueError):
            decode_image("https://example.com/private-photo.jpg")
    def test_reject_bad_base64(self):
        with self.assertRaises(ValueError):
            decode_image("data:image/png;base64,b@d")
    def test_revision_pinned(self):
        self.assertEqual(REVISION,"de431c4043854a71d8101e17995dfe596bf101a5")
    def test_rle_contract_requires_numpy(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("NumPy not installed; run inside prepared D: venv")
        mask=np.array([[0,1,1],[1,0,1]],dtype=bool)
        self.assertEqual(encode_runs(mask),[[1,3],[5,1]])
        self.assertEqual(HASH,"48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7")

if __name__=="__main__":
    unittest.main()
