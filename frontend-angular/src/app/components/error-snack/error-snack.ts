import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';

// Minimal error toast opened via MatSnackBar.openFromComponent (S6.2/S9.6 parity) —
// MatSnackBar's own container doesn't carry role="alert", so this component's root does.
@Component({
  selector: 'app-error-snack',
  imports: [],
  templateUrl: './error-snack.html',
  styleUrl: './error-snack.scss',
})
export class ErrorSnack {
  readonly message = inject<string>(MAT_SNACK_BAR_DATA);
}
