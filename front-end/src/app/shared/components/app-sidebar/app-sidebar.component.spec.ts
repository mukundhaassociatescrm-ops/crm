import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSidebarComponent } from './app-sidebar.component';

describe('AppSidebarComponent employee navigation', () => {
  let fixture: ComponentFixture<AppSidebarComponent>;
  let component: AppSidebarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppSidebarComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');
    fixture = TestBed.createComponent(AppSidebarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isEmployee', true);
    fixture.componentRef.setInput('isPrimaryAdmin', false);
    fixture.detectChanges();
  });

  it('shows only the selected sections with the same items as the admin menu', () => {
    expect(component.visibleSections.map((section) => section.id))
      .toEqual(['communication', 'customer-management']);
    expect(component.visibleSections.flatMap((section) => section.items.map((item) => item.label)))
      .toEqual(['Chats', 'WhatsApp Campaigns', 'Campaign Tracking', 'Bulk SMS', 'Quick SMS', 'Clients', 'Groups']);
    expect(component.visibleStandaloneLinks).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Task Management');
    expect(fixture.nativeElement.textContent).not.toContain('Marketing');
    expect(fixture.nativeElement.textContent).not.toContain('Invoices');
  });

  it('links Dashboard to the employee dashboard and highlights it', () => {
    expect(component.dashboardLink.route).toBe('/employee-dashboard');
    component.currentUrl = '/employee-dashboard';
    expect(component.isItemActive(component.dashboardLink)).toBeTrue();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.app-sidebar__dashboard');
    expect(link.getAttribute('href')).toBe('/employee-dashboard');
  });

  it('renders and highlights employee module links', () => {
    component.collapsed = false;
    component.expandedSections.add('customer-management');
    component.currentUrl = '/customer-management/clients';
    fixture.detectChanges();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/customer-management/clients"]');
    expect(link).toBeTruthy();
    expect(link.classList.contains('app-sidebar__link--active')).toBeTrue();
  });

  it('preserves primary and temporary admin menus', () => {
    fixture.componentRef.setInput('isEmployee', false);
    fixture.componentRef.setInput('isPrimaryAdmin', true);
    fixture.detectChanges();
    expect(component.visibleSections.map((section) => section.id))
      .toEqual(['task-management', 'communication', 'customer-management', 'marketing']);
    expect(component.dashboardLink.route).toBe('/dashboard');
    expect(component.visibleStandaloneLinks.map((link) => link.label))
      .toEqual(['Employees', 'Invoices', 'Work History']);

    fixture.componentRef.setInput('isPrimaryAdmin', false);
    fixture.detectChanges();
    expect(component.visibleSections.map((section) => section.id))
      .toEqual(['communication', 'customer-management', 'marketing']);
    expect(component.visibleStandaloneLinks.map((link) => link.label))
      .toEqual(['Invoices', 'Work History']);
  });
});
