<?php
/**
 * Odbiera zapytanie z formularza na stronie i wysyła je na hello@birchdesign.pl.
 * Wymaga hostingu z PHP i funkcją mail() (home.pl ją ma). Na GitHub Pages (bez PHP) strona
 * automatycznie przełącza się na program pocztowy (mailto), więc formularz działa wszędzie.
 *
 * Zabezpieczenia: tylko POST z tej samej domeny, limit wielkości, usuwanie znaków sterujących
 * (ochrona przed wstrzyknięciem nagłówków), pole-pułapka dla botów, limit 5 zapytań/godz. na adres IP.
 */
declare(strict_types=1);

const TO_ADDRESS   = 'hello@birchdesign.pl';
const FROM_ADDRESS = 'formularz@birchdesign.pl';
const MAX_BODY     = 20000;
const RATE_LIMIT   = 5;      // zapytań
const RATE_WINDOW  = 3600;   // sekund

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function reply(int $code, bool $ok, string $msg = ''): void
{
    http_response_code($code);
    echo json_encode(['ok' => $ok, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function clean(mixed $value, int $max, bool $singleLine): string
{
    $s = is_string($value) ? $value : '';
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    if ($singleLine) {
        $s = preg_replace('/\s+/u', ' ', $s) ?? '';
    }
    return mb_substr(trim($s), 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, false, 'Metoda niedozwolona.');
}

// tylko z tej samej domeny
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = (string) parse_url($origin, PHP_URL_HOST);
    $ownHost = preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    if (strcasecmp($originHost, (string) $ownHost) !== 0) {
        reply(403, false, 'Niedozwolone źródło.');
    }
}

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) {
    reply(413, false, 'Zbyt duża wiadomość.');
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    reply(400, false, 'Nieprawidłowe dane.');
}

// pułapka na boty: człowiek nie widzi tego pola, więc zostaje puste
if (!empty($data['website'])) {
    reply(200, true, 'OK');
}

$name    = clean($data['name'] ?? '', 80, true);
$contact = clean($data['contact'] ?? '', 120, true);
$subject = clean($data['subject'] ?? 'Zapytanie o stronę', 120, true);
$text    = clean($data['text'] ?? '', 4000, false);

if ($name === '' || $contact === '' || $text === '') {
    reply(422, false, 'Uzupełnij wymagane pola.');
}

// limit zapytań na adres IP (plik tymczasowy, bez bazy danych)
$ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
$file = sys_get_temp_dir() . '/bd_form_' . hash('sha256', $ip) . '.json';
$now = time();
$hits = [];
if (is_file($file)) {
    $decoded = json_decode((string) file_get_contents($file), true);
    if (is_array($decoded)) {
        $hits = array_values(array_filter($decoded, static fn($t) => is_int($t) && $t > $now - RATE_WINDOW));
    }
}
if (count($hits) >= RATE_LIMIT) {
    reply(429, false, 'Za dużo zapytań. Spróbuj później albo napisz na ' . TO_ADDRESS . '.');
}

$body = "Nowe zapytanie ze strony birchdesign.pl\n"
      . "----------------------------------------\n"
      . "Imię: $name\nKontakt: $contact\n\n$text\n";

$headers = [
    'From: birchdesign.pl <' . FROM_ADDRESS . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: birchdesign-form',
];
if (filter_var($contact, FILTER_VALIDATE_EMAIL)) {
    $headers[] = 'Reply-To: ' . $contact;   // odpowiedź trafia prosto do klienta
}

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$sent = mail(TO_ADDRESS, $encodedSubject, $body, implode("\r\n", $headers));

if (!$sent) {
    reply(500, false, 'Nie udało się wysłać wiadomości.');
}

$hits[] = $now;
@file_put_contents($file, json_encode($hits), LOCK_EX);
reply(200, true, 'Wysłano.');
