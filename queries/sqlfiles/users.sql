-- Create users with '%' to allow connections from any host
CREATE USER 'trump'@'%' IDENTIFIED BY 'skibidigronk';
CREATE USER 'biden'@'%' IDENTIFIED BY 'sigmagamer';
CREATE USER 'obama'@'%' IDENTIFIED BY 'ohiorizz';
CREATE USER 'bush'@'%' IDENTIFIED BY 'fortnitebattlepass';

-- Grant privileges
GRANT ALL PRIVILEGES ON *.* TO 'trump'@'%';
GRANT SELECT, INSERT, UPDATE ON *.* TO 'biden'@'%';
GRANT SELECT ON *.* TO 'obama'@'%';
GRANT SELECT, INSERT ON *.* TO 'bush'@'%';

FLUSH PRIVILEGES;