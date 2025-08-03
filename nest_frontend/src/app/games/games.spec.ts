import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Games } from './games';

describe('Games', () => {
  let component: Games;
  let fixture: ComponentFixture<Games>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Games]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Games);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
