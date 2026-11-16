<?php
/**
 * Konfiguracja panelu klienta. Skopiuj ten plik jako config.php (w tym samym folderze) i uzupełnij.
 * config.php NIE trafia do repozytorium (jest w .gitignore).
 */
return [
    // 1) Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID
    //    Typ: Web application. Authorized JavaScript origins: https://birchdesign.pl (i ewentualnie https://www.birchdesign.pl)
    //    Skopiowany "Client ID" (kończy się na .apps.googleusercontent.com) wklej niżej.
    'google_client_id' => 'WKLEJ-TUTAJ-CLIENT-ID.apps.googleusercontent.com',

    // 2) Konta Google z dostępem administratora (widzą zakładkę „Klienci”, mogą dodawać projekty).
    'admins' => ['hello@birchdesign.pl'],

    // 3) Adres strony (do linków w e-mailach: potwierdzenie konta, nowe hasło).
    'site_url' => 'https://birchdesign.pl',

    // 4) Na ten adres przychodzą wiadomości klientów z panelu.
    'notify_email' => 'hello@birchdesign.pl',
];
