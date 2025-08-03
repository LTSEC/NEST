import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private devModeSubject = new BehaviorSubject<boolean>(false);
  public devMode$ = this.devModeSubject.asObservable();

  setDevMode(isDev: boolean) {
    this.devModeSubject.next(isDev);
    localStorage.setItem('isDevMode', JSON.stringify(isDev));
  }

  loadFromStorage() {
    const stored = localStorage.getItem('isDevMode');
    if (stored !== null) {
      this.devModeSubject.next(JSON.parse(stored));
    }
  }

  isDevMode(): boolean {
    return this.devModeSubject.value;
  }
}
