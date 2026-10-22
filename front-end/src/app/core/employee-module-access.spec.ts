import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { AuthService } from '../features/auth/auth.service';
import { AuthGuard } from './auth.guard';

describe('Employee module route access', () => {
  let guard: AuthGuard;
  let router: Router;
  let loggedIn: boolean;
  let state: RouterStateSnapshot;
  const layout = routes.find((route) => route.children)!;

  const snapshot = (route: Route): ActivatedRouteSnapshot => {
    const result = new ActivatedRouteSnapshot();
    result.data = route.data || {};
    return result;
  };

  beforeEach(() => {
    loggedIn = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });
    router = TestBed.inject(Router);
    state = router.routerState.snapshot;
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(sessionStorage, 'getItem').and.returnValue(JSON.stringify({ role: 'employee' }));
    guard = TestBed.inject(AuthGuard);
  });

  for (const path of ['communication', 'customer-management']) {
    it(`allows employees into ${path}, including every child/detail route`, () => {
      const hub = layout.children!.find((route) => route.path === path)!;
      expect(guard.canActivateChild(snapshot(hub), state)).toBeTrue();
      for (const child of hub.children!.filter((route) => !route.redirectTo)) {
        expect(guard.canActivateChild(snapshot(child), state)).withContext(child.path || '').toBeTrue();
      }
      expect(router.navigate).not.toHaveBeenCalled();
    });
  }

  it('keeps unrelated admin modules and Payment/Report restricted', () => {
    const taskHub = layout.children!.find((route) => route.path === 'task-management')!;
    const restricted = [
      ...layout.children!.filter((route) =>
        ['manage-employee', 'manage-report', 'work-history', 'marketing', 'manage-sms-templates'].includes(route.path || ''),
      ),
      ...taskHub.children!.filter((route) => ['payment', 'report'].includes(route.path || '')),
    ];
    expect(restricted.length).toBe(7);
    for (const route of restricted) {
      expect(guard.canActivateChild(snapshot(route), state)).withContext(route.path || '').toBeFalse();
    }
    expect(router.navigate).toHaveBeenCalledWith(['/employee-dashboard']);
  });

  it('requires authentication for employee modules', () => {
    loggedIn = false;
    expect(guard.canActivate(snapshot(layout), state)).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
