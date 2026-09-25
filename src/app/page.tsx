import Link from "next/link";
import { UrlForm } from "@/components/UrlForm";
import { recentTracks, stats } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [tracks, counts] = await Promise.all([recentTracks(12), stats()]);

  return (
    <main className="stack stack--wide">
      <section>
        <h1>Текст песни под трек SoundCloud</h1>
        <p className="lead">
          Вставь ссылку — покажем текст и поведём его под музыку. Текста нигде
          нет? Напиши его сам и отбей строки тапами: получится нормальная
          синхронная разметка, и она останется всем остальным.
        </p>
        <UrlForm />
      </section>

      <section className="card">
        <h2>Как это работает</h2>
        <ol className="steps">
          <li>
            <span>
              Ищем текст у себя и в открытой базе LRCLIB. Нашёлся размеченный —
              он сразу поедет под музыку.
            </span>
          </li>
          <li>
            <span>
              Не нашёлся — вставляешь текст простыней, по строке на строку.
            </span>
          </li>
          <li>
            <span>
              Включаешь трек и жмёшь кнопку в начале каждой строки. Можно и по
              словам — тогда подсветка пойдёт по слогам, как в караоке.
            </span>
          </li>
          <li>
            <span>
              Сохраняешь. Дальше этот текст видят все, кто откроет трек, а забрать
              его можно файлом <code>.lrc</code> в свой плеер.
            </span>
          </li>
        </ol>
      </section>

      {tracks.length > 0 ? (
        <section>
          <h2>Недавно разметили</h2>
          <div className="track-list">
            {tracks.map((track) => (
              <Link key={track.id} href={`/track/${track.id}`} className="track-item">
                {track.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.artworkUrl} alt="" />
                ) : (
                  <div
                    style={{ width: 44, height: 44, borderRadius: 8, background: "var(--surface-raised)" }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="title">{track.title}</div>
                  <div className="artist">{track.artist}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="muted small">
        <p style={{ margin: 0 }}>
          Треков: {counts.tracks} · текстов: {counts.lyrics} · из них с метками:{" "}
          {counts.synced}. Звук играет родной плеер SoundCloud — мы ничего не
          скачиваем и не перекладываем. Тексты пишут пользователи;
          правообладатель может убрать любой текст кнопкой «Жалоба» на странице
          трека.
        </p>
      </section>
    </main>
  );
}
