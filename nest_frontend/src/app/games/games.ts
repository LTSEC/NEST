import { Component, OnInit } from '@angular/core';
import { CommonModule }          from '@angular/common';
import { interval }              from 'rxjs';

export interface Game {
  name: string;
  startDate: Date;
  organizer: string;
  type: string;
  duration: string;
  description: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './games.html',
  styleUrls:   ['./games.scss'],
})
export class Games implements OnInit {
  upcoming: Game[] = [
    {
      name:        'example-challenge',
      startDate:   new Date('2025-08-10T14:00:00'),
      organizer:   'NCAE Cyber Games',
      type:        'RvB | CTF',
      duration:    '24 hr',
      description: 'Test your skills in this head-to-head CTF.'
    }
  ];
  countdowns: string[] = [];

  ngOnInit() {
    this.countdowns = this.upcoming.map(() => '');
    interval(1000).subscribe(() => this.tick());
  }

  private tick() {
    const now = Date.now();
    this.upcoming.forEach((g, i) => {
      const d = g.startDate.getTime() - now;
      const h = Math.floor(d/3_600_000),
            m = Math.floor((d%3_600_000)/60_000),
            s = Math.floor((d%60_000)/1_000);
      this.countdowns[i] = 
        `${h.toString().padStart(2,'0')}:`+
        `${m.toString().padStart(2,'0')}:`+
        `${s.toString().padStart(2,'0')}`;
    });
  }
}
