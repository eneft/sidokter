# Initial Administrator Setup

SIDOKTER wajib memiliki Administrator sejak instalasi pertama, tetapi tidak menggunakan `default credential lama yang tidak aman` yang ditanam di source.

1. Set environment variable Firebase Functions: `SIDOKTER_BOOTSTRAP_SECRET=<random-secret-minimal-32-char>`.
2. Buka login SIDOKTER → **Setup Administrator Pertama**.
3. Masukkan setup key tersebut dan buat password Admin sendiri.
4. Username Admin otomatis `admin`.
5. Setelah satu Admin ada, endpoint provisioning menolak semua setup berikutnya.

Password minimal 12 karakter dan wajib memiliki huruf besar, huruf kecil, angka, dan simbol.

Secret hanya boleh berada di environment/server. Jangan commit ke repository atau memasukkannya ke frontend.
