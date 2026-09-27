# Bài 16 — System call và vòng đời chương trình

[Mục lục](../README.md) · [← Bài 15](15-systemd-va-cuu-ho.md) · [Bài 17 →](17-quan-ly-bo-nho.md)

## Mục tiêu: từ một dòng C đến việc Linux thực sự làm

Giả sử bạn viết chương trình đọc `sample.txt` rồi in nội dung ra màn hình. Tại sao chương trình cần nhờ Linux mở file? **Trace — bản ghi theo dõi hoạt động** giúp xem các bước chương trình đã thực hiện; bài này ghi các yêu cầu gửi kernel. Vì sao trace có hàng chục dòng trước lần đọc đầu tiên? Nếu mở file thất bại, làm sao phân biệt tên sai với thiếu quyền?

Sau bài này, bạn cần tự giải thích đường đi của yêu cầu đọc file; phân biệt hàm thư viện với system call; hiểu việc nạp chương trình, bảng file descriptor và mã lỗi; đọc trace của chương trình nhỏ; viết vòng lặp nhập/xuất đúng khi số byte xử lý ít hơn yêu cầu.

Nên đã học bài 03, 11–12 và biết C cơ bản: hàm, mảng, con trỏ, vòng lặp. Các thuật ngữ Linux vẫn được nhắc lại tại chỗ. **Terminal — cửa sổ giao tiếp văn bản** cho phép bạn gõ lệnh và đọc đầu ra; bên trong thường chạy shell như Bash. Lab dùng Linux với Bash, GCC và `strace`; không cần quyền quản trị, chỉ tạo file trong thư mục lab riêng. Trên embedded Linux dùng BusyBox hoặc musl, tên/lựa chọn lệnh và trace khởi động có thể khác hệ glibc phổ biến trên desktop.

## 1. Vì sao chương trình không tự ra lệnh cho ổ đĩa?

**Process — tiến trình** là một lần chương trình đang chạy, có bộ nhớ và tài nguyên Linux quản lý. Chạy `./read-one` hai lần tạo hai lần thực thi riêng, dù cùng dùng một file chương trình. **PID** là số nhận dạng process; dùng `ps -p PID -o pid,comm,args` để xem một PID cụ thể, thay `PID` bằng số thật.

**Kernel — nhân hệ điều hành** là phần lõi quản lý CPU, bộ nhớ và thiết bị, đồng thời kiểm tra ai được truy cập tài nguyên nào. **User space — không gian ứng dụng** là nơi chương trình như trình soạn thảo hoặc chương trình C của bạn chạy với quyền hạn được giới hạn. Sự tách biệt giúp một chương trình lỗi không được tùy ý sửa bộ nhớ của chương trình khác hay điều khiển ổ đĩa trực tiếp.

**System call — lời gọi hệ thống**, thường viết ngắn là **syscall**, là điểm vào có kiểm soát để ứng dụng nhờ kernel làm việc. Ví dụ yêu cầu đọc 128 byte từ file đã mở. Kernel kiểm tra đối tượng và quyền, thực hiện hoặc báo lỗi, rồi trả kết quả. Không phải mọi hàm C đều đi qua ranh giới này: phép cộng hai số thường chỉ cần CPU thực hiện trong ứng dụng.

**API — giao diện lập trình** là tập hàm/quy tắc mà người viết chương trình sử dụng. **Thư viện** là mã dùng lại cung cấp các hàm đó; **libc** là thư viện C cung cấp những hàm quen thuộc như `printf`, `malloc`, `open`. **Wrapper — hàm bao** là hàm thư viện đứng giữa code của bạn và syscall: nó chuẩn bị tham số, gọi kernel rồi trình bày kết quả theo quy ước C. Vì vậy hàm API và syscall có liên quan nhưng không đồng nhất.

Trong tình huống xuyên suốt, code gọi `read(fd, buf, 128)`:

```text
Chương trình C ở user space
    | gọi API read(fd, buf, 128)
    v
Hàm bao read trong libc
    | yêu cầu syscall theo quy ước của CPU/kiến trúc
    v
Kernel: kiểm tra FD, địa chỉ buffer và thao tác đọc
    | lấy dữ liệu nếu có, chờ nếu cần, hoặc trả lỗi
    v
libc -> chương trình: số byte đọc hoặc -1 cùng errno
```

Đọc từ trên xuống. Mũi tên xuống là yêu cầu; dòng cuối là kết quả quay về. **Buffer — bộ đệm** ở đây là mảng `buf` giữ byte vừa đọc để chương trình dùng sau đó. **Byte** là đơn vị 8 bit trên môi trường Linux của lab; ký tự ASCII như `A` dùng một byte, chữ tiếng Việt mã hóa UTF-8 thường dùng nhiều byte. Số byte đọc không phải số ký tự nhìn thấy.

Đường đi vật lý còn phụ thuộc dữ liệu đã ở RAM hay phải lấy từ thiết bị; syscall `read` không tự chứng minh có một lần đọc ổ đĩa. Cách tự kiểm chứng trong bài là `strace`: công cụ ghi lại các syscall mà process thực hiện. Nó thấy ranh giới ứng dụng–kernel, không thấy mọi hàm C hay mọi lệnh CPU. Xem [dự án strace](https://strace.io/) và [manual strace](https://man7.org/linux/man-pages/man1/strace.1.html).

## 2. Gõ một lệnh thì chuyện gì diễn ra trước `main`?

**Shell — trình thông dịch lệnh**, ví dụ Bash, đọc `./read-one sample.txt`, tách tên chương trình và đối số rồi tổ chức việc chạy. `./` nghĩa là thư mục hiện tại, tránh phụ thuộc danh sách thư mục tìm lệnh. **Executable — file chương trình có thể chạy** chứa mã máy hoặc là script có trình thông dịch phù hợp. Có file chưa đủ: cần **quyền thực thi — cho phép yêu cầu chạy file như chương trình** và định dạng mà hệ thống hiểu. Xem `ls -l ./read-one`: ký tự `x` trong nhóm quyền biểu thị quyền thực thi cho nhóm người dùng tương ứng; còn cần quyền đi qua các thư mục trên đường dẫn.

Trường hợp thông thường, shell tạo process con rồi con nạp chương trình cần chạy; shell có thể chọn cơ chế khác tùy lệnh và tối ưu. **`fork`** tạo process con; **`execve`** thay chương trình đang chạy trong một process bằng chương trình khác. `execve` thành công không quay về code cũ và không tạo PID mới. Tách hai việc này giúp hiểu vì sao một process con ban đầu thuộc shell có thể trở thành chương trình C. Xem [fork(2)](https://man7.org/linux/man-pages/man2/fork.2.html) và [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html).

**ELF** là định dạng file chứa mã và thông tin cần nạp của nhiều chương trình Linux. **Liên kết động** nghĩa là executable dùng thêm thư viện dùng chung lúc chạy, thay vì chứa toàn bộ mã thư viện trong chính nó. **Dynamic loader — bộ nạp liên kết động** tìm, nạp và nối các thư viện đó với chương trình. **Mapping — vùng ánh xạ bộ nhớ** là quan hệ giữa một khoảng địa chỉ mà process nhìn thấy và dữ liệu/bộ nhớ phục vụ khoảng đó. **Runtime — mã hỗ trợ lúc chạy** thiết lập điều kiện ban đầu rồi gọi hàm `main` của bạn.

```text
Shell: nhận ./read-one sample.txt
    |
Process được chọn để chạy lệnh -> execve("./read-one", ...)
    |
Kernel: kiểm tra executable, thiết lập bộ nhớ ban đầu
    |
Nếu ELF liên kết động: loader nạp thư viện cần thiết
    |
Runtime khởi tạo -> main(argc, argv)
    |
main đọc/in dữ liệu -> kết thúc -> shell nhận trạng thái
```

Các bước đọc từ trên xuống biểu diễn thứ tự khái niệm; không phải cam kết syscall giống nhau trên mọi shell. Trong `main`, `argc` là số đối số, `argv` là mảng chuỗi đối số; với lệnh trên, `argv[1]` là `sample.txt`. Bộ nạp động có thể mở thư viện, đọc thông tin cấu hình và tạo mapping trước `main`. Bởi vậy trace nhiều dòng không chứng minh code đọc file của bạn đã chạy nhiều lần. Bản liên kết tĩnh, libc khác hoặc kiến trúc CPU khác có trace khác. Xem [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html).

Tự kiểm tra bằng `file ./read-one`; nếu có `readelf`, chạy `readelf -l ./read-one` và tìm phần `INTERP` cùng đường dẫn interpreter. `file` nhận dạng định dạng, không chứng minh chương trình chạy thành công. **Metadata — thông tin mô tả** của ELF cho biết cách file được tổ chức/nạp, khác với việc thực thi mã trong file; `readelf` đọc thông tin ấy, không chạy executable.

## 3. Vì sao mở bằng tên nhưng đọc bằng một số nguyên?

**Đường dẫn** như `./sample.txt` là cách tìm file từ một vị trí trong cây thư mục. **Filesystem — hệ thống tệp** là cách tổ chức tên, thư mục và dữ liệu để Linux có thể tìm và lưu chúng. Ví dụ file `sample.txt` có thể nằm trên ext4, nhưng API đọc file không yêu cầu bạn tự biết vị trí sector trên ổ đĩa.

**File descriptor — số mô tả tệp**, viết **FD**, là số nguyên làm chỉ mục trong bảng tài nguyên mở của process. Sau `open` thành công, chương trình giữ FD để thao tác, thay vì tìm lại đường dẫn cho từng lần đọc. Các FD thường có sẵn là `0` cho **stdin — đầu vào chuẩn**, `1` cho **stdout — đầu ra chuẩn**, `2` cho **stderr — đầu ra báo lỗi**. Chúng có thể trỏ tới terminal, file hoặc đường ống; không luôn là bàn phím/màn hình.

**Open file description — trạng thái một lần mở ở kernel** giữ các thông tin như **offset — vị trí byte sẽ đọc/ghi tiếp**. Đừng nhầm trạng thái này với số FD trong process. Ví dụ minh họa:

```text
Process A: FD 3 ----+
                   +--> một trạng thái mở: offset = 15 --> dữ liệu file
Process A: FD 4 ----+

Một open độc lập: FD 5 --> trạng thái mở khác: offset = 0 --> cùng file
```

Hai mũi tên cùng đến một trạng thái nghĩa là chia sẻ offset. `dup` là thao tác nhân bản FD; FD sau `dup`, hoặc FD được thừa kế qua `fork`, có thể tham chiếu cùng trạng thái mở. Hai lần `open` độc lập thông thường có offset riêng. Số `3`, `4`, `5` chỉ minh họa, không bảo đảm trên máy thật. Xem [open(2)](https://man7.org/linux/man-pages/man2/open.2.html).

Nếu đổi tên file sau khi đã mở, FD vẫn tham chiếu đối tượng mở. **`unlink` — bỏ một tên file khỏi thư mục** cũng không tự làm một FD đang mở mất hiệu lực; dữ liệu còn được giữ khi còn tham chiếu thích hợp. Bài lab phụ sẽ kiểm chứng điều này. `close(fd)` giải phóng FD của process; kernel thu hồi trạng thái bên dưới khi không còn ai tham chiếu. Số FD được tái sử dụng nên lưu một số cũ rồi dùng sau `close` có thể thao tác nhầm tài nguyên mới.

## 4. Trả về `-1`, `0`, hoặc `15` thì hiểu thế nào?

**Return value — giá trị trả về** của hàm là kênh báo kết quả trước tiên. Với các API dùng trong lab, lỗi thường là `-1`. **`errno` — mã nguyên nhân lỗi** là nơi libc cung cấp chi tiết cho luồng thực thi hiện tại khi API quy định có đặt nó. Đọc `errno` chỉ sau khi đã xác nhận thất bại; thành công không bắt buộc xóa mã lỗi cũ. `perror("open")` in nhãn `open` kèm thông điệp theo `errno`; thông điệp có thể đổi theo ngôn ngữ môi trường.

Ví dụ mở `no-such-file` có thể trả `-1`, mã **`ENOENT`** nghĩa là không tìm thấy file hoặc thành phần đường dẫn cần thiết. **`EACCES`** là truy cập bị từ chối: có thể thiếu quyền đọc file hoặc quyền đi qua một thư mục trên đường dẫn. **Permission — quyền truy cập** là quy tắc ai được đọc, ghi, thực thi hoặc đi qua thư mục; xem `ls -l sample.txt` và dùng `namei -l ./sample.txt` nếu công cụ có sẵn để xem từng thành phần. Không dùng `sudo` như cách sửa mặc định cho cả hai lỗi: tên sai không được sửa bằng quyền cao hơn. Xem [errno(3)](https://man7.org/linux/man-pages/man3/errno.3.html).

Với một file thông thường, cách đọc kết quả `read(fd, buf, 128)` là:

| Kết quả | Ý nghĩa | Việc chương trình cần làm |
|---|---|---|
| `15` | Đã đưa 15 byte vào buffer | Chỉ dùng 15 byte đó, không toàn bộ mảng 128 byte |
| `0` | Đã đến cuối file, gọi là EOF | Dừng vòng lặp đọc file |
| `-1` | Thất bại | Đọc `errno`, quyết định báo lỗi hoặc thử lại |

**EOF — end of file** là tình trạng không còn dữ liệu để đọc từ vị trí hiện tại, không phải một byte đặc biệt nằm trong file. Bảng giả định yêu cầu đọc có kích thước khác 0. Kết quả `0` của yêu cầu đọc 0 byte không chứng minh EOF. Với thiết bị hoặc giao tiếp mạng, cần xem quy tắc riêng của đối tượng đó. Xem [read(2)](https://man7.org/linux/man-pages/man2/read.2.html).

### Vì sao chưa đọc/ghi đủ mà hàm vẫn thành công?

**I/O — nhập/xuất dữ liệu** là việc nhận dữ liệu vào hoặc đưa dữ liệu ra ngoài chương trình. `read` và `write` trả số byte thực tế đã xử lý; số này có thể ít hơn số yêu cầu. Nếu yêu cầu ghi 100 byte nhưng trả `40`, lần sau phải ghi từ byte thứ 40, còn 60 byte; ghi lại từ đầu sẽ lặp dữ liệu.

**Signal — tín hiệu** là thông báo bất đồng bộ gửi đến process/luồng, chẳng hạn báo cần dừng. Một thao tác đang chờ có thể bị ngắt và báo **`EINTR`**. Với lab này, nếu chưa xử lý byte nào và API trả `-1/EINTR`, thử lại thao tác là phù hợp. Nếu đã trả số byte dương, phải giữ tiến độ đó. Không phải mọi syscall đều có thể thử lại theo cùng quy tắc; đặc biệt không tự lặp `close` trên Linux, vì FD có thể đã được giải phóng dù có lỗi. Xem [write(2)](https://man7.org/linux/man-pages/man2/write.2.html) và [close(2)](https://man7.org/linux/man-pages/man2/close.2.html).

Một `write` thành công không luôn bảo đảm dữ liệu đã bền vững trên thiết bị lưu trữ. Bài này kiểm tra luồng byte và kết quả syscall; tính bền vững của lưu trữ là câu hỏi khác.

## 5. Nếu dùng `printf` hoặc `mmap`, trace có giống thế không?

`printf` là hàm định dạng của thư viện: nó biến số/chuỗi thành văn bản rồi thường giữ trong buffer trước khi ghi. Nhiều lần `printf` có thể dẫn đến ít lần `write`, hoặc dữ liệu chỉ xuất hiện khi buffer được đẩy ra. Không thấy một `write` cho từng `printf` không có nghĩa chương trình chưa chạy hàm đó. Lab dùng `write` trực tiếp để việc đối chiếu byte dễ hơn.

**`mmap` — ánh xạ bộ nhớ** tạo vùng địa chỉ để chương trình truy cập bằng thao tác đọc/ghi bộ nhớ. Ví dụ file được ánh xạ rồi truy cập `area[0]`: lần truy cập có thể gây **page fault — sự kiện CPU cần kernel xử lý ánh xạ một trang bộ nhớ**, thay vì chương trình gọi `read` tại mỗi byte. Trang là khối quản lý bộ nhớ, sẽ học đầy đủ ở bài 17. Vì vậy trace syscall không phải bản ghi mọi lần đọc dữ liệu: nó có thể chỉ thấy `mmap` ban đầu, không thấy các page fault như một syscall riêng. Xem [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html).

## 6. Lab chính: đọc một khối và đối chiếu trace

### 6.1. Chuẩn bị một nơi thử riêng

Mở terminal thường, không dùng `sudo`:

```bash
command -v gcc
command -v strace
mkdir -p ~/linux-lab/syscalls
cd ~/linux-lab/syscalls
```

`command -v` tìm công cụ trong **PATH — danh sách thư mục shell tìm lệnh**. Có đường dẫn không chứng minh tracing được cho phép; container hoặc chính sách bảo vệ có thể chặn. Nếu thiếu công cụ, cài bằng hướng dẫn của distro đang dùng trước khi tiếp tục. `mkdir -p` tạo thư mục nếu chưa có. Dùng tên file dưới đây chỉ khi chưa chứa bài làm cần giữ.

Lưu mã sau thành `read-one.c` bằng trình soạn thảo:

```c
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s FILE\n", argv[0]);
        return 2;
    }
    int fd = open(argv[1], O_RDONLY);
    if (fd == -1) { perror("open"); return 1; }

    char buf[128];
    ssize_t n;
    do { n = read(fd, buf, sizeof buf); }
    while (n == -1 && errno == EINTR);
    if (n == -1) { perror("read"); close(fd); return 1; }

    ssize_t done = 0;
    while (done < n) {
        ssize_t w = write(STDOUT_FILENO, buf + done, (size_t)(n - done));
        if (w == -1 && errno == EINTR) continue;
        if (w == -1) { perror("write"); close(fd); return 1; }
        if (w == 0) {
            fprintf(stderr, "write: no progress\n");
            close(fd);
            return 1;
        }
        done += w;
    }
    if (close(fd) == -1) { perror("close"); return 1; }
    return 0;
}
```

`O_RDONLY` yêu cầu chỉ đọc. `ssize_t` là kiểu số nguyên có dấu phù hợp kết quả byte của `read`/`write`, chứa được cả số byte và `-1`. `size_t` là kiểu không dấu dùng cho kích thước. `STDOUT_FILENO` là tên hằng số của FD `1`. `buf + done` trỏ đến phần chưa ghi; `(n - done)` là số byte còn lại. Nhánh `w == 0` tránh lặp vô hạn nếu không tiến triển, không dùng `perror` vì chưa có mã lỗi mới được bảo đảm.

Chương trình chỉ đọc **tối đa một khối 128 byte**. Vòng lặp ghi bảo đảm cố đưa hết khối đã đọc ra stdout; nó chưa biến chương trình thành bản thay thế `cat`, vì không lặp `read` đến EOF. Những nhánh xử lý `EINTR` và ghi ngắn là logic phòng trường hợp API cho phép; lab nhỏ không bảo đảm kích hoạt chúng.

### 6.2. Biên dịch và theo dõi lần thành công

```bash
gcc -Wall -Wextra -O0 -g read-one.c -o read-one
printf 'syscall example\n' > sample.txt
strace -o trace.log -e trace=execve,openat,open,read,write,close ./read-one sample.txt
printf 'exit status: %s\n' "$?"
cat trace.log
```

GCC biên dịch C thành executable; `-Wall -Wextra` bật nhóm cảnh báo, `-O0` tắt tối ưu thông thường, `-g` giữ thông tin hỗ trợ gỡ lỗi. Chỉ chạy bước sau khi biên dịch thành công. `>` ghi đè file `sample.txt`. `strace -o` lưu trace riêng để dữ liệu chương trình vẫn in ra terminal. `-e trace=...` giới hạn syscall cần xem. `$?` là trạng thái lệnh vừa kết thúc: cần xem ngay, trước khi lệnh khác thay đổi nó.

Ví dụ **minh họa**, đã lược dòng khởi động, FD thực tế có thể khác:

```text
openat(AT_FDCWD, "sample.txt", O_RDONLY) = 3
read(3, "syscall example\n", 128) = 16
write(1, "syscall example\n", 16) = 16
close(3) = 0
+++ exited with 0 +++
```

`AT_FDCWD` nghĩa là đường dẫn tương đối tính từ thư mục hiện tại. Dòng đầu tìm `sample.txt` và trả FD `3`; dòng thứ hai dùng đúng FD đó; `128` là yêu cầu còn `16` là số byte thật; dòng thứ ba ghi ra FD `1`. `\n` trong trace là biểu diễn ký tự xuống dòng, không phải hai byte dấu gạch chéo và chữ n của dữ liệu gốc. `close` trả `0` nghĩa là thành công theo quy ước của nó, không phải EOF.

Với đúng dữ liệu ASCII `syscall example` kèm xuống dòng, tổng là 16 byte: 15 byte trước xuống dòng và 1 byte xuống dòng. Không nhầm số ký tự hiển thị với số byte có trong file.

Nếu source gọi `open` nhưng trace thấy `openat`, đó là cách libc triển khai API trên môi trường này, không phải lỗi. Trace khác có thể dùng `open`; tên syscall phụ thuộc libc/kiến trúc. Tìm dòng có chính `sample.txt`, không nhầm các lần đọc thư viện lúc khởi động.

### 6.3. So sánh file thiếu, file rỗng và file dài

```bash
strace -o missing.log -e trace=openat,open,read,write,close ./read-one no-such-file
printf 'exit status: %s\n' "$?"
cat missing.log
: > empty.txt
./read-one empty.txt > empty.out
wc -c empty.out
python3 -c 'print("A" * 200, end="")' > long.txt
./read-one long.txt > long.out
wc -c long.txt long.out
```

`no-such-file` phải thực sự chưa tồn tại trong thư mục. Kỳ vọng `open... = -1 ENOENT`, không có lần đọc thành công từ file đó, lỗi in ra stderr và trạng thái chương trình `1`. Trace của việc nạp thư viện vẫn có thể có `read` khác.

`:` là lệnh shell không làm gì; đi với `>` tạo/truncate file rỗng. `wc -c` đếm byte; `empty.out` kỳ vọng `0`, `long.txt` là `200`, `long.out` là `128` trên regular file trong lab thông thường. Chỉ số này xác nhận giới hạn một khối, không xác nhận chương trình sao chép toàn bộ file. Python chỉ tạo dữ liệu, không tham gia đọc file của executable C.

Muốn quan sát `EACCES`, có thể tạo file lab riêng rồi bỏ quyền đọc bằng `chmod`, nhưng tài khoản root hoặc quyền bổ sung có thể vẫn đọc được. Vì vậy bài không dùng thử nghiệm này làm tiêu chí bắt buộc. Phân biệt lỗi dựa vào mã trả về và cấu trúc đường dẫn thực tế.

## 7. Lab phụ: tên biến mất nhưng FD còn đọc được

Cần Python 3. Đoạn này tạo file tạm riêng và xóa đúng file đó; không đụng file cá nhân:

```bash
python3 - <<'PY'
import os
import tempfile

fd, path = tempfile.mkstemp(prefix="linux-fd-lab-")
try:
    os.write(fd, b"FD still works\n")
    os.lseek(fd, 0, os.SEEK_SET)
    os.unlink(path)
    print("Ten con ton tai:", os.path.exists(path))
    print("Du lieu qua FD:", os.read(fd, 100).decode(), end="")
finally:
    os.close(fd)
    if os.path.exists(path):
        os.unlink(path)
PY
```

`mkstemp` tạo tên file và trả FD đã mở. `lseek` đặt offset về đầu, vì lần ghi trước đã đưa nó ra cuối. `unlink` bỏ tên; kỳ vọng `Ten con ton tai: False` nhưng vẫn đọc `FD still works`. Nếu bỏ `lseek`, bạn thường đọc được chuỗi rỗng vì đã ở EOF, không phải vì `unlink` làm FD hỏng. Kết thúc `finally` đóng FD để tài nguyên tạm được thu hồi. Đây là mô hình trên filesystem Linux thông thường, không phải thử nghiệm về mọi filesystem từ xa hoặc chương trình giữ file log.

## 8. Lỗi thường gặp khi diễn giải trace

- **Có nhiều `read` nên cho rằng code đọc nhiều file:** đối chiếu FD với lần `open` và đường dẫn trước đó; bộ nạp thư viện cũng đọc dữ liệu.
- **Dùng `errno` sau thành công:** mã có thể còn từ lỗi trước. Kiểm tra giá trị trả về theo manual của từng hàm rồi mới đọc mã lỗi.
- **Đọc 128 byte rồi in cả 128 dù chỉ nhận 15:** phần còn lại chưa có dữ liệu hợp lệ, có thể làm lộ nội dung bộ nhớ. Chỉ dùng `n` byte; dữ liệu `read` không tự có ký tự kết thúc chuỗi `\0`.
- **Thử lại mọi lỗi hoặc ghi lại từ đầu:** chỉ thử lại khi quy tắc API cho phép; khi ghi ngắn phải tăng offset trong buffer.
- **Trace không có process con:** `strace -f` theo cả process/luồng được tạo thêm. **Attach — gắn công cụ vào process đang chạy** bằng `strace -p PID` có thể bị quyền hoặc **ptrace policy — chính sách cho phép theo dõi process** chặn. Ưu tiên khởi chạy chính chương trình lab dưới `strace`.
- **Syscall mất nhiều thời gian nên kết luận kernel dùng nhiều CPU:** thời gian chờ có thể do dữ liệu chưa đến hoặc process chưa được cấp CPU. **Deschedule — tạm ngừng được chạy trên CPU** là trạng thái scheduler chọn công việc khác; thời gian trôi qua khác thời gian CPU thực thi.
- **Trace là toàn bộ hành vi chương trình:** thao tác trong user space, buffer thư viện và page fault không hiện thành từng syscall. Tracing cũng làm thay đổi thời gian chạy, nên không dùng nó làm phép đo hiệu năng không có điều kiện.

Trace có thể chứa đường dẫn, dữ liệu đọc/ghi hoặc thông tin nhạy cảm. Trong bài chỉ trace file lab; trước khi chia sẻ trace thật, đọc lại phần dữ liệu và giới hạn nội dung ghi bằng tùy chọn của công cụ.

## 9. Tự kiểm tra: giải thích bằng bằng chứng

1. Trace có `openat(..., "sample.txt", ...) = 4` và `read(4, ..., 128) = 16`. Bạn được kết luận gì? **Đối chiếu:** đã mở file thành công và đọc 16 byte từ FD đó; chưa được kết luận đọc ổ đĩa vật lý hay đọc hết một file bất kỳ.
2. `errno` đang là `ENOENT`, nhưng `read` trả `15`. Có báo lỗi không? **Đối chiếu:** không; kết quả là 15 byte thành công, `errno` không phải kênh lỗi độc lập.
3. `write` trả `40` khi yêu cầu `100`. Lần tiếp theo cần tham số nào? **Đối chiếu:** buffer tiến thêm 40 byte, độ dài còn 60; chỉ tính lại nếu chưa có thay đổi khác.
4. Thêm vòng lặp `read` đến EOF để biến lab thành chương trình sao chép. **Đạt khi:** mỗi khối có vòng lặp ghi riêng, xử lý `-1/EINTR`, dừng khi `read` trả `0`, báo lỗi khác và đóng FD; thử file rỗng, 200 byte và file nhiều khối, so sánh bằng `cmp`.
5. Xóa tên sau khi mở rồi đọc bằng FD có được không? **Đối chiếu:** với file lab thông thường có; giải thích thêm offset và thời điểm đóng tham chiếu cuối.
6. Tại sao trace trước `main` có `mmap` và mở thư viện? **Đối chiếu:** liên kết động cần bộ nạp và runtime; source không liệt kê toàn bộ hoạt động khởi động.

**Ghi nhớ:** code gọi API; libc có thể chuyển API thành syscall; kernel xử lý tài nguyên và trả kết quả; FD tham chiếu trạng thái mở, không phải tên file; số byte thực tế quyết định tiến độ. Trace là bằng chứng ở ranh giới syscall. Bài 17 mở rộng phần bộ nhớ: vì sao có vùng địa chỉ nhưng chưa có toàn bộ RAM, và vì sao chạm bộ nhớ có thể gây page fault.

## Nguồn và cách tra cứu tiếp

Các liên kết đặt cạnh nội dung ở trên là tài liệu dự án hoặc Linux man-pages, đã đối chiếu khi biên soạn. Trên máy, số mục manual giúp phân biệt lớp: `man 2 read` cho giao diện syscall, `man 3 errno` cho quy ước thư viện, `man 1 strace` cho công cụ. Dùng thêm `man 2 open`, `man 2 write`, `man 2 close`, `man 2 mmap`, `man 2 execve`, `man 8 ld.so`. Tên syscall và chính sách tracing phải đối chiếu theo libc, kernel, CPU và môi trường thật của bạn.
