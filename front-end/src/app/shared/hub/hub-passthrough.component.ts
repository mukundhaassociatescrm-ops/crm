import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/** Route wrapper — child pages render directly without hub tabs or headings. */
@Component({
  selector: 'app-hub-passthrough',
  standalone: true,
  imports: [RouterModule],
  template: '<router-outlet></router-outlet>',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
    `,
  ],
})
export class HubPassthroughComponent {}
