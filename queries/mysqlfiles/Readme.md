# Build the image
docker build -t minecraft-db .

# Run the container
docker run -d --name minecraft-db -p 5010:3306 minecraft-db