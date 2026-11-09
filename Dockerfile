FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
RUN pip install --no-cache-dir playwright==1.48.0
COPY dfscore.py run_update.py ./

CMD ["python", "run_update.py"]
