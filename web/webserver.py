from flask import Flask, render_template, redirect, url_for, request, flash, abort, jsonify, Response
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
        self.privilege = "user"
        self.color = color


class Admin(UserMixin):
    def __init__(self, username):
        self.id = username
        self.username = username
        self.privilege = "admin"


@login_manager.user_loader
def load_user(user_id):
    """Loads user by user ID or username for Flask-Login."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            user_id = int(user_id)
        except:
            pass
        if type(user_id) == int:

            # Check if the user is a regular team user
            cursor.execute("SELECT team_id, team_name, team_color FROM teams WHERE team_id = %s", (user_id,))
            team = cursor.fetchone()

            if team:
                return User(id=team['team_id'], username=team['team_name'], color=team['team_color'])
            
        else:
            # Check if the user is an admin user (admins are loaded by their name)
            admin_cursor = conn.cursor(cursor_factory=RealDictCursor)
            admin_cursor.execute("SELECT name FROM admin_users WHERE name = %s", (user_id,))
            admin = admin_cursor.fetchone()

            if admin:
                return Admin(username=admin['name'])

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
        username = request.form['username']
        password = request.form['password']
        
        conn = None
        try:
            # Secure parameterized query for fetching user data
            conn = get_db_connection()
            cursor: RealDictCursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT team_id, team_password, team_color FROM teams WHERE team_name = %s", (username,))
            user = cursor.fetchone()

            # Verify password if team exists
            if user and user['team_password'] == password:
                user = User(id=user['team_id'], username=username, color=user['team_color'])
                login_user(user)
                return redirect(url_for('render_page', page=''))
            
            # Check if admin user
            cursor.execute("SELECT password FROM admin_users WHERE name = %s", (username,))
            user = cursor.fetchone()

            if user and user['password'] == password:
                user = Admin(username=username)
                login_user(user)
                return redirect(url_for('admin_landing'))  # Redirect admins to the admin page
            
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
    if current_user.privilege == 'admin':
        return redirect(url_for('admin_landing'))
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
        cursor.execute("""
            SELECT team_name, SUM(points) as total_points 
            FROM team_services ts JOIN teams t 
            ON ts.team_id = t.team_id 
            GROUP BY team_name 
            ORDER BY total_points DESC""")
        leaderboard_data = cursor.fetchall()

    except Exception as e:
        print(f"Error fetching services data: {e}")
    finally:
        if conn:
            conn.close()
    
    last_updated = datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')
    
    return render_template('graphs.html', services_data=services_data, services=services, leaderboard_data=leaderboard_data, last_updated=last_updated)


@app.route('/api/graph-data', methods=['GET'])
@login_required
def get_graph_data():
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
        cursor.execute("""
            SELECT team_name, SUM(points) as total_points 
            FROM team_services ts 
            JOIN teams t ON ts.team_id = t.team_id 
            GROUP BY team_name 
            ORDER BY total_points DESC
        """)
        leaderboard_data = cursor.fetchall()

    except Exception as e:
        print(f"Error fetching graph data: {e}")
    finally:
        if conn:
            conn.close()

    last_updated = datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')

    return jsonify({
        "last_updated": last_updated,
        "services": services,
        "services_data": services_data,
        "leaderboard_data": leaderboard_data
    })


@app.route('/dashboard/services')
@login_required
def services():
    """Fetch and display services for the current user's team, including the last 10 checks."""
    conn = None
    services_data = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        if current_user.privilege == "admin":
            query = """
            SELECT s.service_id, s.service_name, s.box_name, s.disabled
            FROM services s
            """

            cursor.execute(query, (current_user.id,))
            services_data = cursor.fetchall()
            
        else:
            # Query to fetch services and their last 10 checks for the current user's team
            query = """
            SELECT s.service_name, s.box_name, s.disabled, ts.points, ts.is_up, ts.total_checks, ts.successful_checks,
                ARRAY(
                    SELECT json_build_object('status', sc.status, 'timestamp', sc.timestamp)
                    FROM service_checks sc
                    WHERE sc.team_service_id = ts.team_service_id
                    ORDER BY sc.timestamp DESC
                    LIMIT 10
                ) AS last_10_checks
            FROM team_services ts
            JOIN services s ON ts.service_id = s.service_id
            WHERE ts.team_id = %s
            """
            cursor.execute(query, (current_user.id,))
            services_data = cursor.fetchall()

            # Example calculation for uptime percentage
            for service in services_data:
                if service['total_checks'] > 0:
                    service['uptime'] = int(int(service['successful_checks']) / int(service['total_checks']) * 100)
                else:
                    service['uptime'] = 0
    except Exception as e:
        print(f"Error fetching services: {e}")
    finally:
        if conn:
            conn.close()

    return render_template('services.html', services=services_data)


@app.route('/api/services-data', methods=['GET'])
@login_required
def get_services_data():
    """API endpoint to fetch services data for the current user's team."""
    conn = None
    services_data = []
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        if type(current_user.id) != int:
            return jsonify({"services": []}), 200

        # Query to fetch services and their last 10 checks for the current user's team
        query = """
        SELECT s.service_name, s.box_name, ts.points, ts.is_up, ts.total_checks, ts.successful_checks,
               ARRAY(
                   SELECT json_build_object('status', sc.status, 'timestamp', sc.timestamp)
                   FROM service_checks sc
                   WHERE sc.team_service_id = ts.team_service_id
                   ORDER BY sc.timestamp DESC
                   LIMIT 10
               ) AS last_10_checks
        FROM team_services ts
        JOIN services s ON ts.service_id = s.service_id
        WHERE ts.team_id = %s
        """
        cursor.execute(query, (current_user.id,))
        services_data = cursor.fetchall()

        # Calculate uptime percentage
        for service in services_data:
            if service['total_checks'] > 0:
                service['uptime'] = int(int(service['successful_checks']) / int(service['total_checks']) * 100)
            else:
                service['uptime'] = 0

    except Exception as e:
        print(f"Error fetching services data: {e}")
        return jsonify({"error": "Error fetching services data"}), 500
    finally:
        if conn:
            conn.close()

    return jsonify({"services": services_data}), 200


@app.route('/dashboard/announcements', methods=['GET', 'POST'])
@login_required
def announcements():
    """Display all announcements and allow admins to add new ones."""
    conn = None
    announcements_data = []

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Handle POST request to create a new announcement (Admins only)
        if request.method == 'POST' and current_user.privilege == 'admin':
            title = request.form.get('title')
            description = request.form.get('description', '').strip()
            if title and description:
                cursor.execute(
                    """
                    INSERT INTO announcements (title, content, author) 
                    VALUES (%s, %s, %s)
                    """,
                    (title, description, current_user.username)
                )
                conn.commit()
                return redirect(url_for('announcements'))  # Redirect to avoid resubmission

        # Fetch all visible announcements
        if current_user.privilege == 'admin':
            cursor.execute("""
                SELECT announcement_id, title, content, author, created_at, is_visible
                FROM announcements
                ORDER BY created_at DESC
            """)
        else:
            cursor.execute("""
                SELECT announcement_id, title, content, author, created_at, is_visible
                FROM announcements 
                WHERE is_visible = TRUE 
                ORDER BY created_at DESC
            """)
        announcements_data = cursor.fetchall()

    except Exception as e:
        print(f"Error managing announcements: {e}")
    finally:
        if conn:
            conn.close()

    return render_template('announcements.html', announcements=announcements_data)

## ADMIN RELATED

@app.route('/admin')
@login_required
def admin_landing():
    """Admin-only landing page."""
    if not hasattr(current_user, 'privilege') or current_user.privilege != 'admin':
        abort(403)  # Forbidden access for non-admins
    
    return render_template('admin.html', username=current_user.username)

### ANNOUNCEMENTS

@app.route('/announcements/edit/<int:announcement_id>', methods=['POST'])
@login_required
def edit_announcement(announcement_id):
    if current_user.privilege != 'admin':
        abort(403)

    data = request.get_json()
    title = data.get('title')
    content = data.get('content')

    if title and content:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE announcements SET title = %s, content = %s WHERE announcement_id = %s",
                (title, content, announcement_id)
            )
            conn.commit()
        except Exception as e:
            print(f"Error editing announcement: {e}")
        finally:
            conn.close()
    return "Success"


@app.route('/announcements/toggle/<int:announcement_id>', methods=['POST'])
@login_required
def toggle_announcement(announcement_id):
    if current_user.privilege != 'admin':
        abort(403)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE announcements SET is_visible = NOT is_visible WHERE announcement_id = %s",
            (announcement_id,)
        )
        conn.commit()
    except Exception as e:
        print(f"Error toggling visibility: {e}")
    finally:
        conn.close()
    return "Success"


@app.route('/announcements/delete/<int:announcement_id>', methods=['POST'])
@login_required
def delete_announcement(announcement_id):
    if current_user.privilege != 'admin':
        abort(403)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM announcements WHERE announcement_id = %s", (announcement_id,))
        conn.commit()
    except Exception as e:
        print(f"Error deleting announcement: {e}")
    finally:
        conn.close()
    return "Success"

### TEAMS

@app.route('/team-manager')
@login_required
def manage_team():
    if current_user.privilege != 'admin':
        abort(403)

    conn = None
    teams = []

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Fetch all teams
        cursor.execute("""
            SELECT team_id, team_name, team_color
            FROM teams
            ORDER BY team_id
        """)
        teams = cursor.fetchall()

    except Exception as e:
        print(f"Error managing teams: {e}")
    finally:
        if conn:
            conn.close()

    return render_template('teams.html', teams=teams)

@app.route('/team-manager/edit/<int:team_id>', methods=['POST'])
@login_required
def edit_team(team_id):
    if current_user.privilege != 'admin':
        abort(403)

    data = request.get_json()
    team_name = data.get('team_name')[:50]
    password = data.get('team_password')

    if team_name or password:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            if team_name:
                cursor.execute("UPDATE teams SET team_name = %s WHERE team_id = %s", (team_name, team_id))
            if password:
                cursor.execute("UPDATE teams SET team_password = %s WHERE team_id = %s", (password, team_id))
            conn.commit()
        except Exception as e:
            print(f"Error editing team: {e}")
        finally:
            conn.close()
    
    return "Success"


@app.route('/team-manager/add/<int:team_id>', methods=['POST'])
@login_required
def add_team(team_id):
    if current_user.privilege != 'admin':
        abort(403)

    print(team_id)


@app.route('/team-manager/delete/<int:team_id>', methods=['POST'])
@login_required
def delete_team(team_id):
    if current_user.privilege != 'admin':
        abort(403)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM teams WHERE team_id = %s", (team_id,))
        conn.commit()
    except Exception as e:
        print(f"Error deleting team_id: {e}")
    finally:
        conn.close()
    return "Success"

@app.route('/team-manager/get-pass/<int:team_id>', methods=['POST'])
@login_required
def get_pass(team_id):
    # Check if the user is authorized
    if current_user.privilege != 'admin':
        abort(403)

    try:
        # Connect to the database
        conn = get_db_connection()
        cursor = conn.cursor()

        # Query the password for the given team_id
        cursor.execute("SELECT team_password FROM teams WHERE team_id = %s", (team_id,))
        result = cursor.fetchone()

        # If the team_id doesn't exist, return an error
        if not result:
            abort(404, description="Team not found")

        team_password = result[0]  # Extract the password from the result

    except Exception as e:
        print(f"Error getting password: {e}")
        abort(500, description="An error occurred while fetching the password")
    finally:
        # Close the connection
        conn.close()

    # Return the password in a JSON response
    return jsonify({"password": team_password})

### SERVICES

@app.route('/dashboard/services/disable/<int:service_id>', methods=['POST'])
@login_required
def disable_service(service_id):
    if current_user.privilege != 'admin':
        abort(403)

    # Safely get the JSON payload
    data = request.get_json()
    if not data or "disabled" not in data:
        return Response("Invalid input", status=400)

    disabled_state = data["disabled"]

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Update the `disabled` status of the service
        cursor.execute(
            "UPDATE services SET disabled = %s WHERE service_id = %s",
            (disabled_state, service_id)
        )
        conn.commit()
    except Exception as e:
        print(f"Error toggling function of the service: {e}")
        return Response("Failed to update service status", status=500)
    finally:
        if 'conn' in locals():
            conn.close()

    # Return a successful response
    return Response("OK", status=200)



@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True, host=os.getenv("FLASK_HOST", "0.0.0.0"), port=os.getenv("FLASK_PORT", 5000))
