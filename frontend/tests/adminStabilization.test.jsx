import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {AppContext} from '../src/app/providers.jsx';
import {AdminConsole} from '../src/pages/AdminConsole.jsx';
import {PrimaryNav} from '../src/components/layout/Sidebar.jsx';
import {get,put,post} from '../src/lib/api.js';
vi.mock('../src/lib/api.js',()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),describeError:e=>e.message}));
const context={judgeSite:true,mode:{role:'admin'},config:{chainId:11155111,networkName:'Ethereum Sepolia',chainReady:true},account:'0x'+'1'.repeat(40),networkOk:true,session:{token:'isolated-ui-fixture'},hasWallet:true};
function mount(ui){return render(<MemoryRouter><AppContext.Provider value={context}>{ui}</AppContext.Provider></MemoryRouter>);}
beforeEach(()=>{vi.clearAllMocks();get.mockImplementation(path=>Promise.resolve(path==='/admin/me'?{role:'admin'}:{treasuryReserveEth:'0.0003',status:{executionEnabled:false,limits:{minTreasuryEth:'0.0002',dailyTxLimit:0}},invites:[]}));put.mockResolvedValue({});});
afterEach(cleanup);
it('admin mode shows administration/evidence links rather than routes forcibly replaced by its console',()=>{mount(<PrimaryNav/>);expect(screen.getByRole('link',{name:'Administration'})).toBeTruthy();expect(screen.getByRole('link',{name:'Evidence'})).toBeTruthy();expect(screen.queryByRole('link',{name:'Treasury'})).toBeNull();expect(screen.queryByRole('link',{name:'AI Assistant'})).toBeNull();});
it('admin reserve view separates effective reserve from server minimum and confirms a successful save',async()=>{mount(<AdminConsole/>);await screen.findByText('0.0003 ETH');expect(screen.getByText(/Server minimum:/)).toBeTruthy();expect(screen.getAllByText(/minTreasuryEth/).length).toBeGreaterThan(0);fireEvent.change(screen.getByLabelText('Protected treasury balance'),{target:{value:'0.0003'}});fireEvent.click(screen.getByRole('button',{name:'Save shared treasury reserve'}));await screen.findByRole('status');expect(put).toHaveBeenCalledWith('/admin/demo/treasury/reserve',{amount:'0.0003'},{root:true});expect(post).not.toHaveBeenCalled();});
it('server-denied admin verification does not reveal privileged controls',async()=>{get.mockRejectedValue(Error('Not on admin allowlist'));mount(<AdminConsole/>);await screen.findByText('Not on admin allowlist');expect(screen.queryByRole('button',{name:'Save shared treasury reserve'})).toBeNull();});
it('a rejected reserve update displays the backend error without a success notice',async()=>{put.mockRejectedValue(Error('Policy refused'));mount(<AdminConsole/>);fireEvent.change(await screen.findByLabelText('Protected treasury balance'),{target:{value:'0.0003'}});fireEvent.click(screen.getByRole('button',{name:'Save shared treasury reserve'}));await screen.findByText('Policy refused');expect(screen.queryByRole('status')).toBeNull();});
