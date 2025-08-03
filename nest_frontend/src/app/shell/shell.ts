import { Component, OnInit, OnDestroy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth.service';
import { Subscription } from 'rxjs';

export interface NavItem {
  iconUrl: string;
  route:   string;
  label?:  string;
}

@Component({
  selector:   'app-shell',
  standalone: true,
  imports:    [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './shell.html',
  styleUrls:   ['./shell.scss']
})
export class Shell implements OnInit, OnDestroy {
  public isDev = false;
  public navItems: NavItem[] = [];
  private sub!: Subscription;

  private userNav: NavItem[] = [
    { iconUrl: 'assets/Home.png',      route: '/home',      label: 'Home'     },
    { iconUrl: 'assets/Dashboard.png', route: '/dashboard', label: 'Dashboard'},
    { iconUrl: 'assets/Games.png',     route: '/games',     label: 'Games'    },
    { iconUrl: 'assets/Teams.png',     route: '/teams',     label: 'Teams'    },
  ];

  private devNav: NavItem[] = [
    { iconUrl: 'assets/Home.png',      route: '/home',          label: 'Home'     },
    { iconUrl: 'assets/Dashboard.png', route: '/dev-dashboard', label: 'Dashboard'},
    { iconUrl: 'assets/Games.png',     route: '/game-maker',    label: 'Games'    },
  ];

  constructor(private auth: AuthService) {}

  ngOnInit() {
    this.sub = this.auth.devMode$.subscribe(flag => {
      this.isDev = flag;
      this.navItems = flag ? this.devNav : this.userNav;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}