CREATE DATABASE IF NOT EXISTS MemeUsers;

USE MemeUsers;

-- Table for users
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,          -- Unique user ID
    username VARCHAR(50) UNIQUE NOT NULL,       -- Unique username
    email VARCHAR(255) UNIQUE NOT NULL,         -- Unique email address
    password VARCHAR(255) NOT NULL,             -- Store hashed passwords
    birthday DATE NOT NULL,                     -- User's birthday
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Account creation timestamp
    admin BOOLEAN DEFAULT FALSE,               -- Admin flag
    subscriber_count INT DEFAULT 0             -- Tracks the number of subscribers
);

-- Table for posts
CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,         -- Unique post ID
    user_id INT NOT NULL,                      -- Foreign key referencing users
    title VARCHAR(255),                        -- Title of the post
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Post creation timestamp
    likes INT DEFAULT 0,                       -- Number of likes
    views INT DEFAULT 0,                       -- Number of views
    image_url VARCHAR(255),                    -- URL of the uploaded image
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table for subscriptions
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,         -- Unique subscription ID
    user_id INT NOT NULL,                      -- The user being subscribed to
    subscriber_id INT NOT NULL,                -- The user subscribing
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, subscriber_id)            -- Prevent duplicate subscriptions
);