# Use a Python slim base image
FROM python:3.10-slim

# Set the working directory
WORKDIR /app

COPY . .

# Install system dependencies and Python dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose Flask port
EXPOSE 5000

# Run the Flask application
CMD ["python", "webserver.py"]
