from flask import Flask, render_template, redirect, url_for, request, flash, abort
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from datetime import datetime
import psycopg2
import os
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
app.secret_key = 'your_secret_key'

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# PostgreSQL connection details
DATABASE = {
    'dbname': os.getenv('DATABASE_NAME', 'scoring'),
    'user': os.getenv('DATABASE_USER', 'root'),
    'password': os.getenv('DATABASE_PASSWORD', 'root'),
    'host': os.getenv('DATABASE_HOST', 'localhost'),
    'port': os.getenv('DATABASE_PORT', 5432)
}

# Define allowed templates
allowed_templates = {
    "announcements": "announcements.html",
    "services": "services.html",
    "graphs": "graphs.html",
    "": "dashboard.html",
}

# User model class
class User(UserMixin):
    def __init__(self, id, username, color):
        self.id = id
        self.username = username
        self.color = color

@login_manager.user_loader
def load_user(user_id):
    """Loads user by user ID for Flask-Login."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT team_id, team_name, team_color FROM teams WHERE team_id = %s", (user_id,))
        team = cursor.fetchone()
        
        if team:
            return User(id=team['team_id'], username=team['team_name'], color=team['team_color'])
    except Exception as e:
        print(f"Error loading user: {e}")
    finally:
        if conn:
            conn.close()
    return None

def get_db_connection():
    """Establishes and returns a new connection to the PostgreSQL database."""
    return psycopg2.connect(**DATABASE)

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('render_page', page=''))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        team_name = request.form['username']
        team_password = request.form['password']
        
        conn = None
        try:
            # Secure parameterized query for fetching user data
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT team_id, team_password, team_color FROM teams WHERE team_name = %s", (team_name,))
            team = cursor.fetchone()

            # Verify password if team exists
            if team and team['team_password'] == team_password:
                user = User(id=team['team_id'], username=team_name, color=team['team_color'])
                login_user(user)
                return redirect(url_for('render_page', page=''))
            else:
                flash('Invalid credentials', 'error')
        except Exception as e:
            flash('An error occurred while logging in', 'error')
            print(f"Error during login: {e}")
        finally:
            if conn:
                conn.close()
    
    return render_template('login.html')


@app.route('/dashboard', defaults={'page': ''})
@app.route('/dashboard/<page>')
@login_required
def render_page(page):
    # Check if the page is in the allowed templates dictionary
    template = allowed_templates.get(page)
    if template:
        return render_template(template)
    else:
        # Show a 404 error if the page is not found
        abort(404)

@app.route('/dashboard/graphs')
@login_required
def graphs():
    conn = None
    services_data = {}
    services = []
    leaderboard_data = []
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Fetch all services to determine the column headers
        cursor.execute("SELECT DISTINCT service_name FROM services ORDER BY service_name")
        services = [row['service_name'] for row in cursor.fetchall()]

        # Fetch uptime data for each team and service
        cursor.execute("""
            SELECT t.team_name, s.service_name, ts.is_up
            FROM team_services ts
            JOIN teams t ON ts.team_id = t.team_id
            JOIN services s ON ts.service_id = s.service_id
            ORDER BY t.team_name, s.service_name
        """)
        rows = cursor.fetchall()

        for row in rows:
            team_name = row['team_name']
            service_name = row['service_name']
            is_up = row['is_up']
            
            if team_name not in services_data:
                services_data[team_name] = {}
            services_data[team_name][service_name] = is_up

        # Fetch team scores for leaderboard
        cursor.execute("SELECT team_name, SUM(points) as total_points FROM team_services ts JOIN teams t ON ts.team_id = t.team_id GROUP BY team_name ORDER BY total_points DESC")
        leaderboard_data = cursor.fetchall()

    except Exception as e:
        print(f"Error fetching services data: {e}")
    finally:
        if conn:
            conn.close()
    
    last_updated = datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')
    
    return render_template('graphs.html', services_data=services_data, services=services, leaderboard_data=leaderboard_data, last_updated=last_updated)


@app.route('/dashboard/services')
@login_required
def services():
    """Fetch and display services for the current user's team."""
    conn = None
    services_data = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query to fetch services associated with the current user's team
        query = """
        SELECT s.service_name, s.box_name, ts.points, ts.is_up
        FROM team_services ts
        JOIN services s ON ts.service_id = s.service_id
        WHERE ts.team_id = %s
        """
        cursor.execute(query, (current_user.id,))
        services_data = cursor.fetchall()

        # Example calculation for uptime percentage
        for service in services_data:
            service['uptime'] = service['points']  # Replace with actual uptime calculation
    except Exception as e:
        print(f"Error fetching services: {e}")
    finally:
        if conn:
            conn.close()
    
    return render_template('services.html', services=services_data)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True)
