# Commands are here to make it easy for copying and pasting

# Build the image
docker build -t minecraft-db .

# Run the container
docker run -d --name minecraft-db -p 5010:3306 minecraft-db

# Removing the container
docker remove minecraft-db

# Connecting to database example
mysql -u trump -p -P 5010 -h localhost           

# ^^^^^ password is skibidigronk