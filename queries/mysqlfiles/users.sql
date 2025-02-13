-- Create users with '%' to allow connections from any host
CREATE USER 'trump'@'%' IDENTIFIED BY 'password123';
CREATE USER 'biden'@'%' IDENTIFIED BY 'abc12345';
CREATE USER 'obama'@'%' IDENTIFIED BY 'qwerty123';
CREATE USER 'bush'@'%' IDENTIFIED BY '12345678';

-- Grant privileges
GRANT ALL PRIVILEGES ON *.* TO 'trump'@'%';
GRANT SELECT, INSERT, UPDATE ON *.* TO 'biden'@'%';
GRANT SELECT ON *.* TO 'obama'@'%';
GRANT SELECT, INSERT ON *.* TO 'bush'@'%';

FLUSH PRIVILEGES;