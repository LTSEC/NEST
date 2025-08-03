import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DevDashboard } from './dev-dashboard';

describe('DevDashboard', () => {
  let component: DevDashboard;
  let fixture: ComponentFixture<DevDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DevDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
