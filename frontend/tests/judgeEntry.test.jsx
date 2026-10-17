import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Welcome } from '../src/pages/Welcome.jsx';

const app=vi.hoisted(()=>({startDemo:vi.fn(),setMode:vi.fn()}));
vi.mock('../src/app/providers.jsx',()=>({useApp:()=>app}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const mount=()=>render(<MemoryRouter><Welcome/></MemoryRouter>);
it('defaults to the demo wallet and enters without wallet credentials',async()=>{
  mount();
  fireEvent.click(screen.getByRole('button',{name:/Enter in explore mode/}));
  await waitFor(()=>expect(app.startDemo).toHaveBeenCalledWith(undefined));
  expect(app.setMode).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
});
it('passes an invite to the server and labels the live entry',async()=>{
  mount();
  fireEvent.change(screen.getByLabelText(/Invite code/),{target:{value:'aw-test-invite'}});
  fireEvent.click(screen.getByRole('button',{name:/Enter with live transactions/}));
  await waitFor(()=>expect(app.startDemo).toHaveBeenCalledWith('aw-test-invite'));
});
it('admin selection only chooses the SIWE screen; it does not create a demo session',()=>{
  mount();
  fireEvent.click(screen.getByRole('button',{name:/Owner \/ Admin/}));
  fireEvent.click(screen.getByRole('button',{name:/Continue to admin sign-in/}));
  expect(app.setMode).toHaveBeenCalledWith({role:'admin'});
  expect(app.startDemo).not.toHaveBeenCalled();
});
it('personal wallet selection chooses wallet sign-in',()=>{
  mount();
  fireEvent.click(screen.getByRole('button',{name:/Connect my own wallet/}));
  fireEvent.click(screen.getByRole('button',{name:/Continue to wallet sign-in/}));
  expect(app.setMode).toHaveBeenCalledWith({role:'judge',wallet:'personal'});
});
