<?php
/**
 * birchdesign: panel klienta, API (PHP 7.4+).
 * Logowanie: konto Google (Google Identity Services) albo e-mail i hasło (z obowiązkowym potwierdzeniem adresu mailem).
 * Sesja po stronie serwera, ochrona CSRF,
 * dane w pliku data/db.php (z blokadą dostępu przez .htaccess i przez nagłówek <?php exit; ?>).
 * Konfiguracja: config.php (wzór: config.sample.php). Bez config.php API odpowiada "configured": false.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cross-Origin-Opener-Policy: same-origin-allow-popups');

const STAGES = 5;
$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? include $cfgFile : null;
$configured = is_array($cfg) && !empty($cfg['google_client_id']) && strpos($cfg['google_client_id'], 'WKLEJ') === false;   // logowanie Google
$ready = is_array($cfg);                                                                                                         // konfiguracja istnieje (logowanie hasłem)
$siteUrl = rtrim(is_array($cfg) && !empty($cfg['site_url']) ? $cfg['site_url'] : 'https://birchdesign.pl', '/');

function out($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($msg, $code = 400)
{
    out(['ok' => false, 'error' => $msg], $code);
}

// ---------- sesja ----------
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('bd_panel');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ---------- dane ----------
function db_path()
{
    return __DIR__ . '/data/db.php';
}

function db_read()
{
    $p = db_path();
    if (!is_file($p)) {
        return ['clients' => []];
    }
    $raw = file_get_contents($p);
    $nl = strpos($raw, "\n");
    $json = $nl === false ? '' : substr($raw, $nl + 1);
    $db = json_decode($json, true);
    return is_array($db) && isset($db['clients']) ? $db : ['clients' => []];
}

/** Odczyt-zmiana-zapis pod blokadą (dwie osoby naraz nie nadpiszą sobie danych). */
function db_update($fn)
{
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    $htaccess = $dir . '/.htaccess';
    if (!is_file($htaccess)) {
        file_put_contents($htaccess, "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
    }
    $lock = fopen($dir . '/.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        fail('Zapis chwilowo niemożliwy. Spróbuj ponownie.', 503);
    }
    $db = db_read();
    $res = $fn($db);
    $json = json_encode($db, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    file_put_contents(db_path(), "<?php http_response_code(404); exit; ?>\n" . $json, LOCK_EX);
    flock($lock, LOCK_UN);
    fclose($lock);
    return $res;
}

// ---------- pomocnicze ----------
function clean($s, $max = 200)
{
    $s = is_string($s) ? $s : '';
    $s = strip_tags($s);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    $s = trim($s);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function clean_url($u)
{
    $u = trim(is_string($u) ? $u : '');
    if ($u === '') {
        return '';
    }
    if (!filter_var($u, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $u)) {
        return '';
    }
    return substr($u, 0, 500);
}

function clean_email($e)
{
    $e = strtolower(trim(is_string($e) ? $e : ''));
    return filter_var($e, FILTER_VALIDATE_EMAIL) ? substr($e, 0, 120) : '';
}

function is_admin($email)
{
    global $cfg;
    $list = array_map('strtolower', (array)($cfg['admins'] ?? []));
    return in_array(strtolower($email), $list, true);
}

function require_login()
{
    if (empty($_SESSION['user'])) {
        fail('Zaloguj się, aby kontynuować.', 401);
    }
    return $_SESSION['user'];
}

function require_admin()
{
    $u = require_login();
    if (!is_admin($u['email'])) {
        fail('Brak uprawnień.', 403);
    }
    return $u;
}

function check_post()
{
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($tok) || !hash_equals($_SESSION['csrf'], $tok)) {
        fail('Sesja wygasła. Odśwież stronę.', 403);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $oh = parse_url($origin, PHP_URL_HOST);
        $hh = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
        if (!$oh || strcasecmp($oh, $hh) !== 0) {
            fail('Niedozwolone źródło żądania.', 403);
        }
    }
}

function body_json()
{
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 200000) {
        fail('Zbyt duże żądanie.', 413);
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function http_get($url)
{
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false]);
        $r = curl_exec($c);
        $code = curl_getinfo($c, CURLINFO_HTTP_CODE);
        curl_close($c);
        return $code === 200 ? $r : false;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
    return @file_get_contents($url, false, $ctx);
}

/** Sprawdza token Google (podpis, odbiorca, ważność). Zwraca dane użytkownika albo null. */
function verify_google($idToken, $clientId)
{
    if (!is_string($idToken) || strlen($idToken) < 100 || strlen($idToken) > 5000 || substr_count($idToken, '.') !== 2) {
        return null;
    }
    $r = http_get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken));
    if (!$r) {
        return null;
    }
    $j = json_decode($r, true);
    if (!is_array($j)) {
        return null;
    }
    $okIss = in_array($j['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true);
    $okAud = isset($j['aud']) && hash_equals($clientId, (string)$j['aud']);
    $okExp = isset($j['exp']) && (int)$j['exp'] > time();
    $okMail = (($j['email_verified'] ?? '') === 'true' || ($j['email_verified'] ?? false) === true) && !empty($j['email']);
    if (!$okIss || !$okAud || !$okExp || !$okMail) {
        return null;
    }
    return ['email' => strtolower($j['email']), 'name' => clean($j['name'] ?? $j['email'], 80), 'picture' => clean_url($j['picture'] ?? '')];
}

function rate_ok($key, $max, $window)
{
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $f = $dir . '/rl_' . md5($key) . '.txt';
    $now = time();
    $hits = [];
    if (is_file($f)) {
        foreach (explode(',', (string)file_get_contents($f)) as $t) {
            if ((int)$t > $now - $window) {
                $hits[] = (int)$t;
            }
        }
    }
    if (count($hits) >= $max) {
        return false;
    }
    $hits[] = $now;
    @file_put_contents($f, implode(',', $hits), LOCK_EX);
    return true;
}

function client_view($db, $email)
{
    $c = $db['clients'][$email] ?? null;
    return $c ? ['name' => $c['name'] ?? '', 'projects' => array_values($c['projects'] ?? [])] : null;
}

// ---------- konta z hasłem ----------
function send_mail($to, $subject, $text)
{
    global $cfg;
    if (!empty($cfg['mail_debug'])) {   // tylko do testów automatycznych
        @file_put_contents(__DIR__ . '/data/last_mail.txt', "TO: $to\nSUBJECT: $subject\n\n$text\n");
        return true;
    }
    $hdr = 'From: birchdesign <panel@birchdesign.pl>' . "\r\n" . 'Content-Type: text/plain; charset=UTF-8';
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $hdr);
}

function valid_password($p)
{
    return is_string($p) && strlen($p) >= 8 && strlen($p) <= 72;
}

function make_token(&$u, $key, $ttl)
{
    $t = bin2hex(random_bytes(32));
    $u[$key] = hash('sha256', $t);
    $u[$key . '_exp'] = time() + $ttl;
    return $t;
}

function check_token($u, $key, $tok)
{
    return is_array($u) && !empty($u[$key]) && !empty($u[$key . '_exp']) && $u[$key . '_exp'] > time()
        && is_string($tok) && hash_equals($u[$key], hash('sha256', $tok));
}

function start_session($email, $name)
{
    session_regenerate_id(true);
    $_SESSION['user'] = ['email' => $email, 'name' => $name, 'picture' => ''];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'user' => public_user($_SESSION['user'])]);
}

function public_user($u)
{
    return ['email' => $u['email'], 'name' => $u['name'], 'picture' => $u['picture'] ?? '', 'admin' => is_admin($u['email'])];
}

// ---------- trasy ----------
if ($action === 'session') {
    out([
        'ok' => true,
        'configured' => $configured,
        'clientId' => $configured ? $cfg['google_client_id'] : '',
        'passwordEnabled' => $ready,
        'csrf' => $_SESSION['csrf'],
        'user' => !empty($_SESSION['user']) ? public_user($_SESSION['user']) : null,
    ]);
}

if ($method !== 'POST' && !in_array($action, ['me', 'admin_list'], true)) {
    fail('Nieobsługiwane żądanie.', 405);
}

if ($method === 'POST') {
    check_post();
}
if (!$ready) {
    fail('Panel nie jest jeszcze skonfigurowany.', 503);
}

if ($action === 'register') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('reg' . $ip, 8, 3600)) {
        fail('Zbyt wiele prób. Spróbuj za godzinę.', 429);
    }
    $in = body_json();
    $generic = 'Wysłaliśmy wiadomość na podany adres. Kliknij link w niej, żeby aktywować konto (zajrzyj też do spamu). Link działa 24 godziny.';
    if (!empty($in['website'])) {   // pułapka na boty
        out(['ok' => true, 'message' => $generic]);
    }
    $email = clean_email($in['email'] ?? '');
    $name = clean($in['name'] ?? '', 80);
    $pw = $in['password'] ?? '';
    if (!$email) {
        fail('Podaj poprawny adres e-mail.');
    }
    if ($name === '') {
        fail('Podaj imię lub nazwę firmy.');
    }
    if (!valid_password($pw)) {
        fail('Hasło ma mieć od 8 do 72 znaków.');
    }
    if (!rate_ok('regm' . $email, 3, 3600)) {
        fail('Zbyt wiele prób dla tego adresu. Spróbuj później.', 429);
    }
    $mail = null;
    db_update(function (&$db) use ($email, $name, $pw, &$mail) {
        $db['users'] = $db['users'] ?? [];
        $ex = $db['users'][$email] ?? null;
        if ($ex && !empty($ex['verified'])) {
            $mail = ['exists'];
            return;
        }
        $u = ['name' => $name, 'hash' => password_hash($pw, PASSWORD_DEFAULT), 'verified' => false, 'created' => date('c')];
        $tok = make_token($u, 'vtoken', 86400);
        $db['users'][$email] = $u;
        $mail = ['verify', $tok];
    });
    if ($mail && $mail[0] === 'verify') {
        $link = $siteUrl . '/panel/?verify=' . $mail[1] . '&email=' . rawurlencode($email);
        send_mail($email, 'Potwierdź konto w panelu birchdesign', "Cześć $name,\n\nkliknij, żeby aktywować konto w panelu klienta birchdesign:\n\n$link\n\nLink działa 24 godziny. Jeśli to nie Ty zakładasz konto, zignoruj tę wiadomość.\n\nbirchdesign\n");
    } elseif ($mail && $mail[0] === 'exists') {
        send_mail($email, 'Konto w panelu birchdesign już istnieje', "Ktoś próbował założyć konto w panelu birchdesign na ten adres, ale konto już istnieje.\n\nJeśli to Ty, zaloguj się: $siteUrl/panel/ (a jeśli nie pamiętasz hasła, użyj opcji „Nie pamiętam hasła”).\nJeśli to nie Ty, zignoruj tę wiadomość.\n\nbirchdesign\n");
    }
    out(['ok' => true, 'message' => $generic]);
}

if ($action === 'verify') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('ver' . $ip, 30, 600)) {
        fail('Zbyt wiele prób. Spróbuj za kilka minut.', 429);
    }
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    $tok = $in['token'] ?? '';
    $res = null;
    if ($email) {
        db_update(function (&$db) use ($email, $tok, &$res) {
            $u = $db['users'][$email] ?? null;
            if (!check_token($u, 'vtoken', $tok)) {
                return;
            }
            $u['verified'] = true;
            unset($u['vtoken'], $u['vtoken_exp']);
            $db['users'][$email] = $u;
            $res = $u;
        });
    }
    if (!$res) {
        fail('Link jest nieważny albo wygasł. Załóż konto jeszcze raz.', 400);
    }
    start_session($email, $res['name']);
}

if ($action === 'login_pw') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('lpw' . $ip, 30, 600)) {
        fail('Zbyt wiele prób. Spróbuj za kilka minut.', 429);
    }
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    $pw = is_string($in['password'] ?? null) ? $in['password'] : '';
    if (!$email || $pw === '') {
        fail('Podaj e-mail i hasło.');
    }
    if (!rate_ok('lpwm' . $email, 10, 900)) {
        fail('Zbyt wiele prób logowania na to konto. Spróbuj za 15 minut.', 429);
    }
    $db = db_read();
    $u = $db['users'][$email] ?? null;
    $ok = $u ? password_verify($pw, $u['hash'] ?? '') : password_verify($pw, password_hash('x', PASSWORD_DEFAULT));   // stały czas
    if (!$u || !$ok) {
        fail('Nieprawidłowy e-mail lub hasło.', 401);
    }
    if (empty($u['verified'])) {
        fail('Najpierw potwierdź adres e-mail: kliknij link z wiadomości, którą wysłaliśmy po założeniu konta.', 403);
    }
    start_session($email, $u['name']);
}

if ($action === 'forgot') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('fg' . $ip, 8, 3600)) {
        fail('Zbyt wiele prób. Spróbuj za godzinę.', 429);
    }
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    $generic = 'Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła. Link działa godzinę.';
    if (!$email || !rate_ok('fgm' . $email, 3, 3600)) {
        out(['ok' => true, 'message' => $generic]);
    }
    $tok = null;
    db_update(function (&$db) use ($email, &$tok) {
        $u = $db['users'][$email] ?? null;
        if ($u && !empty($u['verified'])) {
            $tok = make_token($u, 'rtoken', 3600);
            $db['users'][$email] = $u;
        }
    });
    if ($tok) {
        send_mail($email, 'Ustaw nowe hasło w panelu birchdesign', "Kliknij, żeby ustawić nowe hasło:\n\n$siteUrl/panel/?reset=$tok&email=" . rawurlencode($email) . "\n\nLink działa godzinę. Jeśli to nie Ty, zignoruj tę wiadomość, hasło się nie zmieni.\n\nbirchdesign\n");
    }
    out(['ok' => true, 'message' => $generic]);
}

if ($action === 'reset') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('rs' . $ip, 20, 600)) {
        fail('Zbyt wiele prób. Spróbuj za kilka minut.', 429);
    }
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    $tok = $in['token'] ?? '';
    $pw = $in['password'] ?? '';
    if (!valid_password($pw)) {
        fail('Hasło ma mieć od 8 do 72 znaków.');
    }
    $res = null;
    if ($email) {
        db_update(function (&$db) use ($email, $tok, $pw, &$res) {
            $u = $db['users'][$email] ?? null;
            if (!check_token($u, 'rtoken', $tok)) {
                return;
            }
            $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
            $u['verified'] = true;
            unset($u['rtoken'], $u['rtoken_exp'], $u['vtoken'], $u['vtoken_exp']);
            $db['users'][$email] = $u;
            $res = $u;
        });
    }
    if (!$res) {
        fail('Link jest nieważny albo wygasł. Poproś o nowy.', 400);
    }
    start_session($email, $res['name']);
}

if ($action === 'login') {
    if (!$configured) {
        fail('Logowanie Google nie jest jeszcze włączone.', 503);
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    if (!rate_ok('login' . $ip, 20, 600)) {
        fail('Zbyt wiele prób. Spróbuj za kilka minut.', 429);
    }
    $in = body_json();
    $u = verify_google($in['credential'] ?? '', $cfg['google_client_id']);
    if (!$u) {
        fail('Nie udało się potwierdzić konta Google.', 401);
    }
    session_regenerate_id(true);
    $_SESSION['user'] = $u;
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'user' => public_user($u)]);
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    out(['ok' => true]);
}

if ($action === 'me') {
    $u = require_login();
    $db = db_read();
    out(['ok' => true, 'user' => public_user($u), 'client' => client_view($db, $u['email'])]);
}

if ($action === 'message') {
    $u = require_login();
    $in = body_json();
    $pid = clean($in['project'] ?? '', 20);
    $text = clean($in['text'] ?? '', 1500);
    if ($text === '') {
        fail('Wpisz wiadomość.');
    }
    if (!rate_ok('msg' . $u['email'], 12, 3600)) {
        fail('Zbyt wiele wiadomości. Spróbuj później.', 429);
    }
    $name = '';
    $found = db_update(function (&$db) use ($u, $pid, $text, &$name) {
        if (!isset($db['clients'][$u['email']])) {
            return false;
        }
        $c = &$db['clients'][$u['email']];
        foreach ($c['projects'] as &$p) {
            if (($p['id'] ?? '') === $pid) {
                $p['updates'][] = ['at' => date('c'), 'by' => 'client', 'kind' => 'message', 'text' => $text];
                $name = $p['name'] ?? '';
                return true;
            }
        }
        return false;
    });
    if (!$found) {
        fail('Nie znaleziono projektu.', 404);
    }
    $to = $cfg['notify_email'] ?? 'hello@birchdesign.pl';
    $hdr = 'From: panel@birchdesign.pl' . "\r\n" . 'Reply-To: ' . $u['email'] . "\r\n" . 'Content-Type: text/plain; charset=UTF-8';
    @mail($to, '=?UTF-8?B?' . base64_encode('Panel klienta: wiadomość od ' . $u['name']) . '?=', "Projekt: $name\nKlient: {$u['name']} <{$u['email']}>\n\n$text\n", $hdr);
    $db = db_read();
    out(['ok' => true, 'client' => client_view($db, $u['email'])]);
}

// ---------- administrator ----------
if ($action === 'admin_list') {
    require_admin();
    $db = db_read();
    $list = [];
    foreach ($db['clients'] as $email => $c) {
        $list[] = ['email' => $email, 'name' => $c['name'] ?? '', 'projects' => array_values($c['projects'] ?? [])];
    }
    out(['ok' => true, 'clients' => $list]);
}

if ($action === 'admin_save') {
    require_admin();
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    if (!$email) {
        fail('Podaj poprawny e-mail klienta (konto Google).');
    }
    $cname = clean($in['client_name'] ?? '', 80);
    $pin = is_array($in['project'] ?? null) ? $in['project'] : [];
    $pay = [];
    foreach ((array)($pin['payments'] ?? []) as $x) {
        if (!is_array($x)) {
            continue;
        }
        $pay[] = [
            'id' => clean($x['id'] ?? bin2hex(random_bytes(3)), 12),
            'label' => clean($x['label'] ?? 'Płatność', 80),
            'amount' => max(0, (float)($x['amount'] ?? 0)),
            'status' => ($x['status'] ?? '') === 'paid' ? 'paid' : 'due',
            'due' => clean($x['due'] ?? '', 40),
            'paid_at' => clean($x['paid_at'] ?? '', 20),
            'url' => clean_url($x['url'] ?? ''),
        ];
    }
    $files = [];
    foreach ((array)($pin['files'] ?? []) as $x) {
        if (is_array($x) && clean_url($x['url'] ?? '') !== '') {
            $files[] = ['name' => clean($x['name'] ?? 'Plik', 80), 'url' => clean_url($x['url'])];
        }
    }
    $updates = [];
    foreach ((array)($pin['updates'] ?? []) as $x) {
        if (is_array($x) && clean($x['text'] ?? '', 1500) !== '') {
            $updates[] = [
                'at' => clean($x['at'] ?? date('c'), 40),
                'by' => ($x['by'] ?? '') === 'client' ? 'client' : 'admin',
                'kind' => (($x['kind'] ?? '') === 'update' && ($x['by'] ?? '') !== 'client') ? 'update' : 'message',
                'title' => clean($x['title'] ?? '', 90),
                'tag' => clean($x['tag'] ?? '', 30),
                'text' => clean($x['text'], 1500),
            ];
        }
    }
    $proj = [
        'id' => clean($pin['id'] ?? '', 20) ?: bin2hex(random_bytes(4)),
        'name' => clean($pin['name'] ?? 'Nowy projekt', 120),
        'package' => clean($pin['package'] ?? '', 80),
        'stage' => min(STAGES, max(1, (int)($pin['stage'] ?? 1))),
        'next' => clean($pin['next'] ?? '', 200),
        'preview_url' => clean_url($pin['preview_url'] ?? ''),
        'payments' => $pay,
        'files' => $files,
        'updates' => $updates,
    ];
    db_update(function (&$db) use ($email, $cname, $proj) {
        if (!isset($db['clients'][$email])) {
            $db['clients'][$email] = ['name' => $cname, 'projects' => []];
        }
        if ($cname !== '') {
            $db['clients'][$email]['name'] = $cname;
        }
        $done = false;
        foreach ($db['clients'][$email]['projects'] as $i => $p) {
            if (($p['id'] ?? '') === $proj['id']) {
                $db['clients'][$email]['projects'][$i] = $proj;
                $done = true;
            }
        }
        if (!$done) {
            $db['clients'][$email]['projects'][] = $proj;
        }
    });
    $db = db_read();
    $list = [];
    foreach ($db['clients'] as $e => $c) {
        $list[] = ['email' => $e, 'name' => $c['name'] ?? '', 'projects' => array_values($c['projects'] ?? [])];
    }
    out(['ok' => true, 'clients' => $list]);
}

if ($action === 'admin_delete') {
    require_admin();
    $in = body_json();
    $email = clean_email($in['email'] ?? '');
    $pid = clean($in['project'] ?? '', 20);
    db_update(function (&$db) use ($email, $pid) {
        if (!isset($db['clients'][$email])) {
            return;
        }
        if ($pid === '') {
            unset($db['clients'][$email]);
            return;
        }
        $db['clients'][$email]['projects'] = array_values(array_filter($db['clients'][$email]['projects'], function ($p) use ($pid) {
            return ($p['id'] ?? '') !== $pid;
        }));
    });
    $db = db_read();
    $list = [];
    foreach ($db['clients'] as $e => $c) {
        $list[] = ['email' => $e, 'name' => $c['name'] ?? '', 'projects' => array_values($c['projects'] ?? [])];
    }
    out(['ok' => true, 'clients' => $list]);
}

fail('Nieznana akcja.', 404);
