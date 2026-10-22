import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { FullscreenModeService } from '../../core/services/fullscreen-mode.service';

import { MainLayoutComponent } from './main-layout.component';

describe('MainLayoutComponent', () => {
  let component: MainLayoutComponent;
  let fixture: ComponentFixture<MainLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { getUser: () => ({ role: 'employee', name: 'Employee' }) } },
        { provide: FullscreenModeService, useValue: { activeKey$: of(null), syncRoute: () => {} } },
      ],
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MainLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the employee sidebar with an employee Dashboard link', () => {
    expect(component.showSidebar).toBeTrue();
    const sidebar: HTMLElement = fixture.nativeElement.querySelector('app-sidebar');
    expect(sidebar).toBeTruthy();
    expect(sidebar.querySelector('.app-sidebar__dashboard')?.getAttribute('href'))
      .toBe('/employee-dashboard');
    expect(sidebar.textContent).toContain('Communication');
    expect(sidebar.textContent).toContain('Customer Management');
    expect(sidebar.textContent).not.toContain('Task Management');
  });

  it('hides the sidebar in fullscreen mode', () => {
    component.fullscreenActive = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-sidebar')).toBeNull();
  });

  it('recognizes legacy user accounts as employees', () => {
    component.currentUser = { role: 'user' };
    expect(component.isEmployee).toBeTrue();
    expect(component.showSidebar).toBeTrue();
  });

  it('opens and closes employee navigation on mobile', () => {
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-toggle');
    toggle.click();
    fixture.detectChanges();
    expect(component.mobileSidebarOpen).toBeTrue();
    expect(fixture.nativeElement.querySelector('.app-sidebar--mobile-open')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const backdrop: HTMLElement = fixture.nativeElement.querySelector('.app-sidebar__backdrop');
    backdrop.click();
    fixture.detectChanges();
    expect(component.mobileSidebarOpen).toBeFalse();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
