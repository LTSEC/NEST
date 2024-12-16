# Use a Python slim base image
FROM python:3.10-slim
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 5000
CMD ["python", "webserver.py"]
