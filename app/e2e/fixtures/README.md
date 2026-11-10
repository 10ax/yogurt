# Test audio

Both clips are public-domain LibriVox recordings, 16.5 s each, cut from 0:40 and converted to 16 kHz mono 16-bit wav
with `ffmpeg -ss 40 -t 16.5 -i <mp3> -ac 1 -ar 16000 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact <wav>`.
Two different readers, so the two sides of a meeting sound like two people.

| File | Source | Reader | Licence |
|---|---|---|---|
| meeting-me.wav | The Art of War by Sun Tzu, tr. Lionel Giles, chapters 1-2: https://archive.org/download/art_of_war_librivox/art_of_war_01-02_sun_tzu_64kb.mp3 (catalog: https://librivox.org/the-art-of-war-by-sun-tzu/) | Moira Fogarty | Public domain (LibriVox) |
| meeting-them.wav | Rock A Bye Library: A Book of Fables, section 1: https://archive.org/download/rockabye_library_ds_librivox/rockabyelibrary_01_anonymous_64kb.mp3 (catalog: https://librivox.org/rock-a-bye-library-a-book-of-fables-author-unknown/) | Denny Sayers | Public domain (LibriVox) |

sha256 of the source mp3s: `6cb289fa9a13cfc94b18e8a89159da687c60db88c2b6377311f9bc5664d5492f` (Art of War),
`fc473fa2f0da8fbd5beed7c2155baf0afc09ad19fd6c12f3063ecdb24f1f40ff` (Rock A Bye Library).

The speed check's clip, `app/resources/speed/clip.wav`, is John F. Kennedy's inaugural address (1961), a work of the
United States government and in the public domain; its source is in `app/resources/speed/README.txt`.
