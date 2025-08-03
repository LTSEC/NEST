import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router'
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  username = '';
  password = '';
  isDevMode = false;

  constructor(private auth: AuthService, private router: Router) {}

  toggleDevMode() {
    this.isDevMode = !this.isDevMode;
    this.auth.setDevMode(this.isDevMode);
  }

  onLogin() {
    this.auth.setDevMode(this.isDevMode);
    if (this.isDevMode) {
      this.router.navigate(['/dev-dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
