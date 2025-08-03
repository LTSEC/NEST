import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  constructor(private auth: AuthService) {}

  ngOnInit() {
    this.auth.loadFromStorage();
  }

  protected readonly title = signal('nest_frontend');
}
