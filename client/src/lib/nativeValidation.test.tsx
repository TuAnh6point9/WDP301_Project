// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { nativeValidationHandlers } from './nativeValidation';
import { MemoryRouter } from 'react-router-dom';
import { RouteErrorBoundary } from '@/app/navigation/NavigationTransition';

afterEach(cleanup);
describe('localized native validation',()=>{
  it('keeps the existing page error boundary but hides technical messages',()=>{
    function BrokenPage(): never { throw new Error('Internal stack CODE_123'); }
    const logged=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      render(<MemoryRouter><RouteErrorBoundary><BrokenPage/></RouteErrorBoundary></MemoryRouter>);
      expect(screen.getByText('Page could not be loaded.')).toBeTruthy();
      expect(screen.getByText('Could not load the page. Please reload and try again.')).toBeTruthy();
      expect(document.body.textContent).not.toContain('CODE_123');
    } finally { logged.mockRestore(); }
  });
  it('preserves required/email rules and clears custom validity after correction',()=>{
    render(<form {...nativeValidationHandlers}><input aria-label="Email" type="email" required/></form>);
    const input=screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe('Please fill in this field.');
    fireEvent.input(input,{target:{value:'invalid'}});
    expect(input.checkValidity()).toBe(false);
    expect(input.validationMessage).toBe('Invalid format. Please check and try again.');
    fireEvent.input(input,{target:{value:'valid@example.com'}});
    expect(input.checkValidity()).toBe(true);
    expect(input.validationMessage).toBe('');
  });
  it('keeps numeric min/max/step and pattern constraints',()=>{
    render(<form {...nativeValidationHandlers}><input aria-label="Number" type="number" min="0" max="14" step="0.5"/><input aria-label="Code" pattern="[A-Z]{2}-[0-9]{2}"/></form>);
    const number=screen.getByLabelText('Number') as HTMLInputElement;
    fireEvent.input(number,{target:{value:'15'}});
    expect(number.checkValidity()).toBe(false);
    expect(number.validationMessage).toBe('Value must be between 0 and 14.');
    fireEvent.input(number,{target:{value:'7.2'}});
    expect(number.checkValidity()).toBe(false);
    expect(number.validationMessage).toBe('Please enter a value that matches the allowed step.');
    fireEvent.input(number,{target:{value:'7.5'}});
    expect(number.checkValidity()).toBe(true);
    const code=screen.getByLabelText('Code') as HTMLInputElement;
    fireEvent.input(code,{target:{value:'x'}});
    expect(code.checkValidity()).toBe(false);
    expect(code.validationMessage).toBe('Invalid format. Please check and try again.');
    fireEvent.input(code,{target:{value:'AK-01'}});
    expect(code.checkValidity()).toBe(true);
  });
});
