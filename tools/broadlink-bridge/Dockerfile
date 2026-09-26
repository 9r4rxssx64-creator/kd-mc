FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir broadlink flask flask-cors gunicorn

COPY bridge.py /app/bridge.py

EXPOSE 8780

ENV PORT=8780 HOST=0.0.0.0

# --net=host requis pour UDP discovery Broadlink
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8780/health', timeout=3)"

CMD ["python", "bridge.py"]
