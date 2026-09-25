# Как поднять SCLiveSubtitles на своём сервере

Одна команда на чистом сервере. Всё остальное — по желанию.

## Что нужно

- Сервер с Ubuntu 22.04/24.04 или Debian 12, доступ root.
- Открытые порты **80** и **443** (иначе не получить сертификат).
- 1 ГБ памяти хватает с запасом: сервис хранит текст, а не музыку.

Докер, база и сертификат ставятся сами — заранее ничего готовить не надо.

## Установка

```bash
curl -fsSL https://raw.githubusercontent.com/embernxck/sclivesubtitles/main/deploy.sh | bash
```

Минуты три, и в конце будет напечатан адрес вида
`https://203.0.113.10.sslip.io` — сайт уже работает, с настоящим сертификатом.

### Что делает эта команда

1. Ставит Docker и git, если их нет.
2. Кладёт проект в `/opt/sclivesubtitles`.
3. Определяет внешний IP и делает из него имя через `sslip.io` — это бесплатный
   сервис, который превращает адрес `203.0.113.10.sslip.io` в тот же IP. Имя
   нужно затем, что на голый IP сертификаты не выдают, а на имя — выдают.
4. Поднимает три контейнера: базу, сайт и вход с автоматическим HTTPS.

### Со своим доменом

Сначала заведите у регистратора A-запись на IP сервера, потом:

```bash
curl -fsSL https://raw.githubusercontent.com/embernxck/sclivesubtitles/main/deploy.sh \
  | DOMAIN=example.com bash
```

Домен можно привязать и позже — просто запустите команду ещё раз с `DOMAIN`.

## Дальше

Всё из папки `/opt/sclivesubtitles`:

```bash
cd /opt/sclivesubtitles

docker compose logs -f app     # что происходит
docker compose ps              # кто жив
docker compose restart app     # перезапустить сайт
docker compose down            # остановить всё (данные остаются)
```

### Обновить до свежей версии

Та же команда, что и при установке. Данные не трогает:

```bash
curl -fsSL https://raw.githubusercontent.com/embernxck/sclivesubtitles/main/deploy.sh | bash
```

### Резервная копия базы

Тексты — единственное, что не восстановить, так что копию стоит делать:

```bash
cd /opt/sclivesubtitles
docker compose exec -T db tar czf - /var/lib/sqld > ~/sclive-$(date +%F).tar.gz
```

### Отдача текстов в LRCLIB

Выключена по умолчанию: это публикация наружу, её включают осознанно. Когда
захотите — в `/opt/sclivesubtitles/.env` поставьте `SCLIVE_LRCLIB_PUBLISH=true`
и `docker compose up -d`. После этого у автора размеченного текста появится
кнопка «В LRCLIB», и размеченное у вас увидят пользователи других плееров.

## Безопасность

Сразу после установки:

```bash
passwd                                  # сменить пароль root
ssh-copy-id root@ваш-сервер             # выполняется на своей машине
```

А затем в `/etc/ssh/sshd_config` поставить `PasswordAuthentication no` и
`systemctl restart ssh` — вход останется только по ключу.

Наружу торчат только 80 и 443. База порты не публикует вовсе: с ней
разговаривает лишь сайт, по внутренней сети докера.

## Если что-то пошло не так

**«не определил внешний IP»** — задайте сами:

```bash
curl -fsSL https://raw.githubusercontent.com/embernxck/sclivesubtitles/main/deploy.sh \
  | PUBLIC_IP=203.0.113.10 bash
```

**Сайт не открывается по https** — почти всегда закрыт 80-й порт: без него
Let's Encrypt не может проверить владение именем. Проверьте firewall хостера
и `ufw status`. Что происходит с сертификатом, видно в `docker compose logs web`.

**Сайт отвечает 500** — `docker compose logs app`. Если там про базу, посмотрите
`docker compose ps`: контейнер `db` должен быть `healthy`.

## Без своего сервера

Проект обычный Next.js, поднимается и на бесплатном хостинге: Vercel для сайта
и [Turso](https://turso.tech) для базы. В настройках проекта нужен
`DATABASE_URL` вида `libsql://…` и `DATABASE_AUTH_TOKEN` из Turso — код
менять не нужно, он работает и с файлом, и с базой-сервером.
