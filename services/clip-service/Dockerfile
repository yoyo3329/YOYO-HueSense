FROM python:3.11-slim

WORKDIR /service

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /service/requirements.txt

RUN pip install --no-cache-dir -r /service/requirements.txt

COPY clip_service.py /service/clip_service.py

CMD ["python", "-u", "clip_service.py"]