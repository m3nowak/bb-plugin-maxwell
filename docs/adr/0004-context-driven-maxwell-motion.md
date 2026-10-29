# Powiąż ruch Maxwella z oglądaną rozmową

Prędkość obrotu Maxwella ma pokazywać bieżące zapełnienie kontekstu aktywnego czatu, dlatego zastępuje ręcznie ustawianą, zapisaną prędkość wątku z [ADR 0001](0001-persistent-thread-rotation-speed.md). Narzędzie ustawiania prędkości zostaje usunięte, a prędkość wynika liniowo z zapełnienia kontekstu, od 24 do 120 RPM. Kompaktowanie i wyczyszczenie kontekstu mogą ją zmniejszyć. Przy braku danych obowiązuje ostatni znany odczyt tej rozmowy, a bez niego 24 RPM.

Aktywny czat obejmuje również oglądaną rozmowę, w której agent czeka. Uwolniony Maxwell śledzi czat w wybranej części widoku, a Maxwell w panelu rozmowę przypisaną do panelu; konteksty agentów nie są sumowane.

Poza aktywnym czatem Maxwell wykonuje taniec przodem do widza, w stałym tempie według bujającej części [filmu referencyjnego](https://www.youtube.com/watch?v=rXh8Hvo7gfs), niezależnie od muzyki. Taniec uwolnionego Maxwella współistnieje z jego lotem i odbijaniem od krawędzi. Przełączenia animacji i zmiany prędkości mają płynne przejście trwające około 0,5 sekundy, aby nawigacja i nowe odczyty nie powodowały skoków ruchu.

Specyfikacja funkcji: [issue #9](https://github.com/m3nowak/bb-plugin-maxwell/issues/9).
