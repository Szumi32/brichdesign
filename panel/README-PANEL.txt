PANEL KLIENTA birchdesign: uruchomienie (około 10 minut)
==========================================================

Co to jest
  Strona logowania kontem Google oraz panel, w którym klient widzi: etapy projektu, najbliższy krok, płatności
  (zaliczka i płatność końcowa), pliki, link do podglądu strony i wiadomości. Ty, jako administrator, dodajesz
  klientów i projekty w zakładce „Klienci”.

Wymagania
  - Hosting z PHP 7.4 lub nowszym (home.pl: tak) i działający HTTPS (certyfikat SSL dla birchdesign.pl).
  - GitHub Pages NIE obsługuje PHP: panel działa tylko na hostingu home.pl, nie pod szumi32.github.io.

Krok 1: Client ID z Google (jednorazowo, za darmo)
  1. Wejdź na https://console.cloud.google.com i zaloguj się kontem Google.
  2. Utwórz projekt (np. „birchdesign panel”).
  3. Menu: „APIs & Services” → „OAuth consent screen”. Typ „External”, nazwa aplikacji „birchdesign”,
     e-mail pomocy: hello@birchdesign.pl. Zakresy: tylko podstawowe (email, profile, openid). Zapisz.
     (Jeśli Google poprosi o publikację: kliknij „Publish app”, bo panel używa tylko podstawowych danych.)
  4. „Credentials” → „Create credentials” → „OAuth client ID” → typ „Web application”.
     „Authorized JavaScript origins”: https://birchdesign.pl  (oraz https://www.birchdesign.pl, jeśli używasz www).
     Pole „Authorized redirect URIs” zostaw puste.
  5. Skopiuj „Client ID” (kończy się na .apps.googleusercontent.com). Client Secret NIE jest potrzebny.

Krok 2: plik konfiguracyjny na serwerze
  1. W folderze panel/ na serwerze skopiuj config.sample.php jako config.php (np. w menedżerze plików home.pl).
  2. Wklej swój Client ID do pola 'google_client_id'.
  3. W 'admins' zostaw konta Google, które mają zarządzać klientami (domyślnie hello@birchdesign.pl; to konto musi
     być prawdziwym kontem Google, żeby dało się nim zalogować).
  4. Zapisz. Gotowe: wejdź na https://birchdesign.pl/panel/ i zaloguj się.

Jak dodać klienta
  Zaloguj się kontem administratora → zakładka „Klienci” → wpisz e-mail Google klienta, nazwę projektu, etap i kwotę.
  Klient po zalogowaniu tym adresem zobaczy swój projekt. Nowe wiadomości od klientów przychodzą też na e-mail.

Bezpieczeństwo (co jest zrobione)
  - Logowanie wyłącznie przez Google, token jest weryfikowany po stronie serwera (odbiorca, wystawca, ważność).
  - Sesja w ciasteczku HttpOnly + SameSite, odświeżana po zalogowaniu; ochrona CSRF; sprawdzanie źródła żądania.
  - Dane klientów w panel/data/db.php: plik jest zablokowany przez .htaccess i dodatkowo zaczyna się od
    „<?php exit; ?>”, więc nie da się go pobrać z przeglądarki. Zrób sobie jego kopię zapasową.
  - Klient widzi wyłącznie własne projekty; zakładka „Klienci” działa tylko dla kont z listy 'admins'.
  - Panel ma znacznik noindex, więc nie pojawia się w Google.

Pliki
  index.html        strona logowania i panel (cały front-end)
  api.php           obsługa logowania, danych i wiadomości
  config.php        TWOJA konfiguracja (nie wgrywaj do repozytorium; paczka jej nie zawiera)
  data/             tworzony automatycznie; tu leżą dane klientów (nie nadpisuj przy aktualizacjach)

Podgląd wyglądu bez serwera (tylko na własnym komputerze)
  python -m http.server 5190, potem http://localhost:5190/panel/index.html?demo  (dodaj &admin dla widoku administratora).
  Tryb demo działa wyłącznie na localhost i nie ma nic wspólnego z prawdziwym logowaniem.
