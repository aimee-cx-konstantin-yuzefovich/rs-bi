import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import { safeLoginDestination, loginRedirect } from '@/lib/login-navigation';
import { useLoginRedirect } from '@/hooks/use-login-redirect';

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), replace: vi.fn(), refresh: vi.fn(), status: 'unauthenticated', params: '', production: false }));
vi.mock('next-auth/react', () => ({ signIn: mocks.signIn, useSession: () => ({ status: mocks.status }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/lib/config', () => ({ get IS_PRODUCTION() { return mocks.production; }, WP_LOGIN_URL_CLIENT: 'https://portal.example/wp-login.php' }));
vi.mock('next/image', () => ({ default: ({ fill, priority, alt, ...props }: any) => <img alt={alt} {...props} /> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.clearAllMocks(); mocks.params = ''; mocks.status = 'unauthenticated'; mocks.production = false; });
function fill() {
  fireEvent.change(screen.getByLabelText('Корпоративная почта'), { target: { value: 'person@russilica.ru' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password' } });
}

describe('login form', () => {
  it('allows submitting empty fields and focuses the first error', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByText('Введите корпоративную почту')).toBeVisible();
    expect(screen.getByLabelText('Корпоративная почта')).toHaveFocus();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('validates malformed email and focuses a missing password', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Корпоративная почта'), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByText('Введите корректный адрес почты')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Корпоративная почта'), { target: { value: 'person@russilica.ru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(screen.getByLabelText('Пароль')).toHaveFocus();
  });
  it('supports password managers and an accessible visibility toggle', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Корпоративная почта')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'current-password');
    const toggle = screen.getByRole('button', { name: 'Показать пароль' });
    expect(toggle.tabIndex).toBe(0);
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute('href', 'https://portal.example/wp-login.php?action=lostpassword');
  });
  it('prevents duplicate submits and preserves email after rejection', async () => {
    let resolve!: (value: unknown) => void;
    mocks.signIn.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<LoginPage />); fill();
    fireEvent.submit(screen.getByRole('form'));
    fireEvent.submit(screen.getByRole('form'));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Входим…' })).toBeDisabled();
    await act(async () => resolve({ error: 'CredentialsSignin' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте почту и пароль');
    expect(screen.getByLabelText('Корпоративная почта')).toHaveValue('person@russilica.ru');
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });
  it.each([
    ['ACCESS_DENIED', 'доступ к BI-терминалу не разрешён'],
    ['Internal sensitive error', 'Сейчас не удаётся подключиться'],
  ])('maps %s without leaking internal errors', async (error, text) => {
    mocks.signIn.mockResolvedValue({ error });
    render(<LoginPage />); fill(); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });
  it('does not treat a missing signIn response as successful', async () => {
    mocks.signIn.mockResolvedValue(undefined);
    render(<LoginPage />); fill(); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Сейчас не удаётся подключиться');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('returns to the report including filters and hash', async () => {
    mocks.params = new URLSearchParams({ callbackUrl: '/companies?responsible=Anna#report', reason: 'session-expired' }).toString();
    mocks.signIn.mockResolvedValue({ ok: true });
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Сессия завершена');
    fill(); fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/companies?responsible=Anna#report'));
  });
  it.each([429, 502])('handles production HTTP %s before NextAuth', async status => {
    mocks.production = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, code: 'SERVICE_UNAVAILABLE' }), { status })));
    render(<LoginPage />); fill(); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 429 ? 'Слишком много попыток' : 'Сейчас не удаётся подключиться');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});

describe('safe return paths', () => {
  it.each(['https://evil.test/', '//evil.test/', '/login?callbackUrl=/', '/api/auth/signout', '/%6cogin', '/\\evil.test', 'javascript:alert(1)', '/companies/../login'])('rejects %s', value => {
    expect(safeLoginDestination(value, 'https://bi.test')).toBe('/');
  });
  it('preserves local absolute URLs and creates an encoded login URL', () => {
    expect(safeLoginDestination('https://bi.test/companies?q=a#b', 'https://bi.test')).toBe('/companies?q=a#b');
    const url = new URL(loginRedirect({ pathname: '/companies', search: '?q=a', hash: '#b' }, true), 'https://bi.test');
    expect(url.searchParams.get('callbackUrl')).toBe('/companies?q=a#b');
    expect(url.searchParams.get('reason')).toBe('session-expired');
  });
  it('only marks an observed active session as expired', () => {
    function Guard({ status }: { status: 'authenticated' | 'unauthenticated' }) { useLoginRedirect(status); return null; }
    const view = render(<Guard status="unauthenticated" />);
    expect(mocks.replace.mock.lastCall?.[0]).not.toContain('session-expired');
    view.rerender(<Guard status="authenticated" />);
    view.rerender(<Guard status="unauthenticated" />);
    expect(mocks.replace.mock.lastCall?.[0]).toContain('session-expired');
  });
});
