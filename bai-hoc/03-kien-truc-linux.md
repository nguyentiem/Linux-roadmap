# Bài 03 — Kiến trúc Linux và vai trò các thành phần

[Mục lục](../README.md) · [← Bài 02](02-linux-va-distro.md) · [Bài 04 →](04-linux-va-rtos.md)

## Mục tiêu và liên hệ

Dựa trên bài 01–02, vẽ được đường đi ứng dụng → kernel → phần cứng và xác định subsystem có thể gây lỗi. Không cần hiểu source kernel ở giai đoạn này.

Học bài này theo một câu hỏi xuyên suốt: **khi gõ `cat /tmp/linux-architecture.txt`, thành phần nào nhận lệnh, thành phần nào đọc file, và dữ liệu đi qua những lớp nào?** Trước hết phân biệt hai miền thực thi, sau đó nhận diện các bộ phận trong kernel, cuối cùng ghép chúng thành một luồng đọc file và dùng lệnh lab để kiểm tra. Sơ đồ là mô hình để suy luận; đường đi cụ thể còn phụ thuộc filesystem, cache và thiết bị của máy.

## 1. Hai miền thực thi

User space chứa ứng dụng, shell, dịch vụ và thư viện. Kernel space chứa mã đặc quyền quản lý tài nguyên chung. CPU và cơ chế bảo vệ bộ nhớ giới hạn thao tác của user space; ứng dụng không được tùy ý truy cập RAM của tiến trình khác hoặc lập trình thiết bị.

```text
USER SPACE (chương trình thông thường)
  terminal → shell → cat, dịch vụ, thư viện C…
                   │ yêu cầu qua system call
═══════════════════╪════════ ranh giới bảo vệ ═══════════════
KERNEL SPACE       ▼
  quản lý tiến trình | bộ nhớ | VFS/filesystem | mạng | driver
                   │ điều khiển, trao đổi dữ liệu
PHẦN CỨNG          ▼
  CPU | RAM | thiết bị lưu trữ | card mạng…
```

Sơ đồ cho thấy **ai có quyền làm gì**. Ứng dụng ở user space có thể tính toán trên dữ liệu của mình, nhưng không được tự ý đọc mọi địa chỉ RAM hay điều khiển trực tiếp mọi thiết bị. Kernel có quyền cao hơn để chia sẻ và bảo vệ tài nguyên. “User space” và “kernel space” nói về **mức đặc quyền và vùng mã**, không phải hai CPU khác nhau: cùng một CPU có thể lần lượt chạy mã user và mã kernel.

Ví dụ, `strlen()` thường chỉ đếm ký tự trong bộ nhớ mà tiến trình đã truy cập được; thao tác đó không cần nhờ kernel. Ngược lại, `read()` cần lấy dữ liệu qua một file descriptor do kernel quản lý, nên thường đi qua system call. Nhiều hàm thư viện chỉ là mã user space; một số hàm là lớp bọc quanh system call. Không thể suy “gọi hàm C” thì chắc chắn đã chuyển vào kernel.

System call là điểm vào được kiểm soát. Kernel kiểm tra tham số và quyền, thực hiện yêu cầu rồi trả kết quả hoặc mã lỗi. Chuyển user/kernel mode không nhất thiết là context switch sang tiến trình khác: task hiện tại có thể tiếp tục chạy nhưng ở chế độ kernel.

### Một lời gọi `read()` đi qua ranh giới ra sao?

```text
Mã ứng dụng: read(fd, buffer, 100)
        ↓
Thư viện C chuyển đối số theo quy ước gọi hệ thống
        ↓  CPU vào kernel mode qua cơ chế system call
Kernel kiểm tra fd và vùng nhớ, tìm đối tượng gắn với fd
        ↓
Đọc tối đa 100 byte, có thể phải chờ dữ liệu
        ↓  CPU trở về user mode
Ứng dụng nhận số byte đã đọc hoặc lỗi
```

`fd` là **file descriptor**, một số nguyên để tiến trình tham chiếu tới file, pipe, socket hoặc đối tượng tương tự đã mở. `buffer` là vùng nhớ ứng dụng đưa ra để nhận dữ liệu. `read()` **có thể trả ít hơn 100 byte** dù không lỗi; trả `0` thường biểu thị hết file với file thông thường, còn lỗi được báo bằng giá trị `-1` và `errno` ở giao diện thư viện C. Vì vậy chương trình đúng phải kiểm tra giá trị trả về, không giả định một lần gọi sẽ lấy đủ số byte yêu cầu. Xem [man 2 read](https://man7.org/linux/man-pages/man2/read.2.html).

**Mode switch** là đổi mức đặc quyền user ↔ kernel để xử lý system call, interrupt hoặc exception. **Context switch** là đổi thread/task đang chạy và trạng thái thực thi của nó. Một lần `read()` được phục vụ nhanh từ cache có thể vào kernel rồi trở lại cùng thread mà không cần đổi sang thread khác. Nếu `read()` phải chờ I/O, scheduler có thể chọn thread khác; lúc đó có thêm context switch. Hai khái niệm liên quan nhưng không đồng nghĩa.

Linux thường được mô tả là monolithic modular kernel. Nhiều subsystem và driver chạy trong cùng miền kernel, trong khi module cho phép bổ sung một số thành phần lúc chạy. Module không có mức cách ly như tiến trình user space; lỗi driver có thể ảnh hưởng cả máy.

“**Monolithic**” ở đây nghĩa là các chức năng lõi như quản lý bộ nhớ, filesystem, mạng và nhiều driver chạy trong cùng miền kernel, có thể gọi lẫn nhau bằng giao diện nội bộ. “**Modular**” nghĩa là một số phần có thể được build thành module để nạp khi cần; phần khác có thể được build **trực tiếp vào kernel**. Module không biến Linux thành kiến trúc microkernel, cũng không chạy trong một tiến trình user space riêng. Vì chia sẻ miền đặc quyền, lỗi ở module/driver có thể tác động rộng hơn lỗi ở một ứng dụng thông thường. `/proc/modules` chỉ liệt kê module **đang được nạp**, không liệt kê mọi driver built-in. Xem [man 5 proc_modules](https://man7.org/linux/man-pages/man5/proc_modules.5.html) và [tài liệu build module của kernel](https://docs.kernel.org/kbuild/modules.html).

## 2. Bản đồ subsystem

| Thành phần | Trách nhiệm | Dấu hiệu cần khảo sát |
|---|---|---|
| Scheduler | Chọn task runnable và CPU | Run queue, context switch |
| Memory manager | Mapping, page fault, reclaim | Page fault, pressure, OOM |
| VFS/filesystem | Tên file, inode, thao tác file | Quyền, mount, lỗi I/O |
| Block layer/driver | Gửi yêu cầu đến storage | Độ trễ, lỗi thiết bị |
| Network stack | Socket, routing, giao thức | Retransmission, drop |
| IPC | Pipe, signal, shared memory… | Chờ giao tiếp, deadlock |
| Security | Kiểm tra quyền và policy | Permission denied, audit |

Đọc bảng theo cách “**trách nhiệm → câu hỏi chẩn đoán**”, không theo cách “thấy một triệu chứng thì đã tìm ra thủ phạm”. Ví dụ ứng dụng đọc file chậm có thể do chờ storage, do filesystem mạng, do tranh chấp tài nguyên hoặc do chính ứng dụng; cần thêm bằng chứng trước khi kết luận.

### Các nhóm chức năng chính trong kernel

- **Scheduler (bộ lập lịch):** chọn thread *runnable* để chạy trên CPU. *Runnable* nghĩa là thread sẵn sàng chạy, không phải đang chờ I/O. Nếu nhiều thread cùng cần CPU, chúng chia thời gian xử lý; số lần chuyển context và thời gian chờ CPU có thể giúp điều tra, nhưng không tự chứng minh scheduler có lỗi.
- **Memory manager (quản lý bộ nhớ):** tạo ánh xạ địa chỉ ảo, cấp/thu hồi trang nhớ, xử lý page fault và áp lực bộ nhớ. Một page fault có thể là sự kiện bình thường khi trang được nạp theo nhu cầu; chỉ nhìn số page fault mà không có ngữ cảnh chưa đủ kết luận máy thiếu RAM.
- **VFS và filesystem:** VFS cung cấp cách thao tác thống nhất với đường dẫn, file descriptor và các đối tượng file; filesystem cụ thể như ext4, tmpfs hay một filesystem mạng quyết định cách dữ liệu được lưu/truy xuất. VFS giúp cùng lệnh `cat` đọc nhiều loại filesystem mà không cần viết lại `cat`. [Tài liệu VFS của kernel](https://docs.kernel.org/filesystems/vfs.html) mô tả vai trò lớp này.
- **Block layer và driver:** với storage kiểu block, các lớp này chuyển yêu cầu I/O tới thiết bị hoặc thiết bị ảo và nhận kết quả. Không phải mọi file đều đi qua block layer: `tmpfs` giữ dữ liệu trong bộ nhớ, còn filesystem mạng có đường đi khác.
- **Network stack:** xử lý giao thức, socket, định tuyến và trao đổi gói. Khi ứng dụng nói chuyện qua mạng, lỗi có thể nằm ở ứng dụng, cấu hình mạng, giao thức hoặc đường truyền; kernel chỉ là một trong các lớp cần xem.
- **IPC (giao tiếp liên tiến trình):** gồm pipe, signal, shared memory và các cơ chế khác để tiến trình/threads phối hợp. Một tiến trình đứng yên có thể đang đợi dữ liệu từ pipe, khóa hoặc một sự kiện; “không dùng CPU” không đồng nghĩa đã treo vô cớ.
- **Security:** kiểm tra quyền file, thông tin định danh và các chính sách bảo vệ khác. Khi bị `Permission denied`, cần kiểm tra cả quyền trên file, quyền đi qua các thư mục cha, mount và chính sách liên quan; không chỉ nhìn một dòng quyền của file.

Các bộ phận này hợp tác trong một thao tác. Chẳng hạn `cat` chờ đọc file: VFS tìm đối tượng file, memory manager quản lý page cache, driver có thể lấy dữ liệu từ thiết bị, scheduler cho thread khác chạy lúc `cat` chờ, và cơ chế security kiểm tra quyền truy cập.

Ba tên thường gặp khi đọc tài liệu VFS: **dentry** giúp nối tên trong một thư mục tới đối tượng, **inode** lưu metadata và thông tin về đối tượng file trong filesystem, còn **file descriptor** là số mà một tiến trình dùng để tham chiếu tới file đã mở. Một file có thể có nhiều tên liên kết tới cùng inode; nhiều tiến trình cũng có thể cùng mở một file. Vì vậy, “tên file”, “đối tượng file” và “file descriptor” là ba góc nhìn khác nhau, dù người mới thường gọi chung là “file”. Ở bài này chỉ cần nhận ra vai trò của chúng, chưa cần học cấu trúc dữ liệu kernel.

Ở user space, init điều phối khởi tạo; daemon cung cấp chức năng nền; thư viện cung cấp API; package manager quản lý phần mềm. Desktop là lớp tùy chọn, không phải điều kiện để kernel hoạt động.

**Init/service manager** là tiến trình quản lý việc khởi động và vòng đời nhiều dịch vụ ở user space; trên nhiều hệ là systemd, nhưng không phải mọi hệ Linux đều dùng nó. **Daemon** là chương trình phục vụ công việc nền, ví dụ một web server. **Thư viện** cung cấp hàm cho chương trình; **package manager** cài và cập nhật phần mềm. Chúng dựa vào kernel để dùng CPU, RAM và I/O, nhưng không vì thế trở thành mã kernel. Một hệ Linux chỉ có giao diện dòng lệnh vẫn có thể hoạt động đầy đủ cho nhiều tác vụ mà không cần desktop.

## 3. Theo một lần đọc file

```text
Shell phân tích câu lệnh
  → tạo/chạy chương trình cat
  → mở đường dẫn, kernel kiểm tra quyền và mount
  → đọc qua VFS/filesystem
  → page cache có dữ liệu? Nếu chưa, yêu cầu storage
  → chép dữ liệu về buffer ứng dụng
  → ghi ra stdout, ví dụ terminal
```

Không phải mỗi lần đọc đều truy cập đĩa. Một lần đọc cũng có thể bị chia thành nhiều yêu cầu I/O. Các lớp abstraction giúp chương trình dùng cùng API cho nhiều filesystem nhưng không làm chúng có đặc tính hiệu năng giống nhau.

### Đi chậm qua từng bước của `cat`

1. **Shell nhận lệnh.** Khi bạn gõ `cat /tmp/linux-architecture.txt`, shell phân tích tên chương trình và đối số, rồi khởi chạy `cat`. Terminal là nơi nhập/hiển thị; shell là chương trình hiểu cú pháp lệnh. Hai thứ có thể được dùng cùng nhau nhưng không phải cùng một thành phần.
2. **`cat` yêu cầu mở file.** Nó đưa đường dẫn cho kernel qua lời gọi thư viện/system call. Kernel giải quyết đường dẫn theo cây thư mục và các mount, kiểm tra quyền, rồi trả về file descriptor nếu thành công. Đường dẫn là **tên để tìm đối tượng**, còn file descriptor là **tay cầm tới đối tượng đã mở** trong tiến trình.
3. **`cat` yêu cầu đọc.** VFS chuyển thao tác tới filesystem phù hợp. Với I/O có bộ đệm thông thường, dữ liệu có thể đã ở **page cache**. Nếu chưa có, filesystem có thể cần yêu cầu tầng storage hoặc nguồn dữ liệu khác; thao tác có thể khiến `cat` phải chờ. [Tài liệu page cache của kernel](https://docs.kernel.org/mm/page_cache.html) mô tả cache là đường thường dùng cho việc đọc/ghi file, dù có trường hợp đi đường khác.
4. **Dữ liệu trở về ứng dụng.** Kernel chép số byte phù hợp vào buffer của `cat` và trả số byte đã đọc. `cat` có thể lặp lại `read()` nhiều lần cho đến khi hết file.
5. **`cat` ghi ra stdout.** Nếu stdout nối với terminal, bạn thấy chữ trên màn hình; nếu dùng `cat file > out.txt`, shell đã nối stdout tới file đích nên cùng chương trình `cat` sẽ ghi ra file. Như vậy “stdout” là một luồng đầu ra, không đồng nghĩa cố định với màn hình.

Sơ đồ ở đầu mục là **đường đi khái niệm**. Ví dụ file ở `/tmp` có thể nằm trên `tmpfs` (chủ yếu dùng RAM) hoặc trên một filesystem gắn với storage, tùy hệ thống. Một file trên filesystem mạng có thể đi qua network stack. Đừng vẽ mũi tên tới SSD chỉ vì thấy tên “file”; hãy kiểm tra mount thực tế của đường dẫn.

### Khi `cat` lỗi, bắt đầu từ lớp nào?

| Thông báo/hiện tượng | Giả thuyết đầu tiên | Bằng chứng tiếp theo |
|---|---|---|
| `No such file or directory` | Sai đường dẫn, file chưa tồn tại hoặc một thành phần của đường dẫn thiếu | `ls -l` đường dẫn và thư mục cha; kiểm tra tên, mount |
| `Permission denied` | Thiếu quyền với file, thư mục cha hoặc có chính sách hạn chế | `ls -ld` các thư mục, `ls -l` file; xem chính sách khi quyền thường có vẻ đúng |
| `Input/output error` | Lỗi ở filesystem, thiết bị hoặc nguồn dữ liệu phía sau | Kiểm tra log kernel và tình trạng thiết bị/phần lưu trữ liên quan |
| Lệnh chạy rất chậm | Có thể chờ I/O, tài nguyên CPU hoặc nguồn dữ liệu khác | Xem loại filesystem/mount và đo thời gian ở các lớp phù hợp |

Bảng chỉ giúp **đặt giả thuyết**, không phải chẩn đoán chắc chắn. Một lỗi `EIO` trên filesystem mạng chẳng hạn không nhất thiết là SSD cục bộ hỏng. [man 2 read](https://man7.org/linux/man-pages/man2/read.2.html) liệt kê những mã lỗi mà ứng dụng có thể gặp.

## 4. Lab: ghép thành phần với bằng chứng

```bash
printf 'hello Linux\n' > /tmp/linux-architecture.txt
cat /tmp/linux-architecture.txt
stat /tmp/linux-architecture.txt
findmnt -T /tmp/linux-architecture.txt -o TARGET,SOURCE,FSTYPE
ps -p 1 -o comm=
cat /proc/filesystems
cat /proc/modules | head
ls /sys/class
```

Lệnh đầu dùng `printf` để tạo nội dung thử nghiệm; toán tử `>` là **redirection do shell xử lý** để mở file đích. `cat` sau đó là một chương trình khác đọc file vừa tạo. Nếu bạn đã có file cùng tên ở `/tmp`, lệnh đầu sẽ ghi đè nó; hãy đổi tên file lab nếu cần giữ dữ liệu cũ.

| Lệnh | Đang quan sát điều gì? | Cách đọc và giới hạn |
|---|---|---|
| `cat /tmp/linux-architecture.txt` | Ứng dụng user space yêu cầu đọc file | Thấy chữ `hello Linux` chứng minh đường đọc thông thường hoạt động, không chứng minh đã truy cập SSD. |
| `stat ...` | Metadata của file: kích thước, quyền, thời gian… | Là thông tin filesystem trả về; không cho biết toàn bộ đường I/O vật lý. |
| `findmnt -T ...` | Mount chứa đường dẫn và loại filesystem (`FSTYPE`) | Nếu là `tmpfs`, ví dụ này không đại diện cho một lần đọc file từ SSD; nguồn mount có thể là lớp ảo. |
| `ps -p 1 -o comm=` | Tên tiến trình PID 1 trong môi trường quan sát | Trong container, PID 1 có thể là tiến trình của container, không phải init của host. |
| `cat /proc/filesystems` | Các filesystem mà kernel hiện hỗ trợ/đã đăng ký | Có cả filesystem built-in và module đã nạp; `nodev` không yêu cầu block device. Không đồng nghĩa tất cả đang được mount. |
| `cat /proc/modules \| head` | Một phần danh sách module đang nạp | `head` chỉ in các dòng đầu; danh sách rỗng không chứng minh máy không có driver built-in. |
| `ls /sys/class` | Các lớp thiết bị kernel công bố qua sysfs | Tên lớp không phải danh sách đầy đủ mọi thiết bị vật lý. |

`/proc` là **pseudo-filesystem** cho thông tin tiến trình và kernel; `/sys` là **sysfs** biểu diễn đối tượng và thuộc tính kernel cho user space. Nhiều mục trông giống file thông thường nhưng giá trị được kernel tạo khi đọc, không nhất thiết nằm thành các byte trên ổ đĩa. Một số mục có thể ghi để đổi cấu hình nên lab này chỉ đọc. Xem [man 5 proc](https://man7.org/linux/man-pages/man5/proc.5.html), [man 5 proc_filesystems](https://www.man7.org/linux/man-pages/man5/proc_filesystems.5.html) và [tài liệu sysfs của kernel](https://docs.kernel.org/filesystems/sysfs.html).

Ví dụ cách đọc kết quả `findmnt` **giả định**:

```text
TARGET  SOURCE  FSTYPE
/tmp    tmpfs   tmpfs
```

Kết quả giả định này cho biết đường dẫn lab nằm trong mount `tmpfs`. Bạn có thể nói `cat` đã đi qua giao diện VFS/filesystem, nhưng **không** thể dùng lần chạy đó làm bằng chứng đã đọc SSD. Nếu máy khác báo `/` là `ext4` và `/tmp` nằm dưới `/`, file lab có thể đi qua storage; ngay cả lúc đó, nội dung có thể được trả từ page cache nên một lần `cat` vẫn chưa chứng minh có I/O vật lý. Đây là khác biệt giữa **đường đi có thể xảy ra** và **điều đã quan sát được**.

Ghi mỗi lệnh đang quan sát lớp nào. Nếu `/proc/modules` rỗng, không kết luận máy không có driver: driver có thể được build vào kernel. Nếu `findmnt` không có trong môi trường tối giản, dùng `df -T /tmp/linux-architecture.txt` làm đầu mối rồi ghi rõ giới hạn quan sát. Xóa đúng file lab đã tạo bằng `rm /tmp/linux-architecture.txt` sau khi hoàn tất.

Đầu ra: vẽ lại sơ đồ đọc file theo filesystem bạn quan sát được; kèm bảng ba giả thuyết khi `cat` thất bại: đường dẫn không tồn tại, không đủ quyền, hoặc lỗi I/O. Mỗi giả thuyết ghi **lệnh/bằng chứng sẽ kiểm tra**, không chỉ tên lỗi. Ở bài 16 bạn sẽ kiểm chứng ranh giới system call bằng `strace`.

## 5. Mẹo và tự kiểm tra

- “Mọi thứ là file” là cách ghi nhớ giao diện, không có nghĩa mọi đối tượng đều là regular file hoặc hỗ trợ cùng thao tác.
- Shell không phải kernel; terminal không phải shell.
- Hàm `strlen()` thường xử lý trong user space; `read()` thường đi vào kernel. Vì sao sự khác biệt này ảnh hưởng tracing? **Công cụ chỉ theo dõi system call sẽ thấy lời gọi đi qua ranh giới kernel, nhưng không thấy mọi lời gọi hàm thuần user space như `strlen()`.**
- Context switch và mode switch khác gì? **Một bên đổi task đang chạy, bên kia đổi mức đặc quyền. Vào kernel không nhất thiết đổi task; khi đổi task, kernel thực hiện việc chuyển ngữ cảnh.**
- `read(fd, buf, 100)` trả 27 có chắc là lỗi không? **Không.** Lời gọi có thể đọc ít hơn số byte yêu cầu; chương trình phải dùng giá trị trả về thực tế.
- `/proc/filesystems` có `ext4` thì `/tmp` chắc đang dùng ext4 không? **Không.** Danh sách này nói kernel hỗ trợ kiểu filesystem nào; dùng `findmnt -T /tmp` để xem mount chứa đường dẫn.
- `/proc/modules` không có tên driver của ổ đĩa thì chắc kernel thiếu driver không? **Không.** Driver có thể được build sẵn vào kernel hoặc thiết bị được trình bày qua lớp ảo khác.

## 6. Tổng kết mô hình tư duy

```text
Ứng dụng user space cần tài nguyên
      ↓ system call (đổi mức user → kernel)
Kernel kiểm tra và phối hợp subsystem phù hợp
      ↓ VFS / memory / scheduler / driver / network…
Dữ liệu hoặc kết quả quay lại ứng dụng
```

Khi gặp lỗi, trước hết hỏi **ứng dụng đang yêu cầu tài nguyên nào**; sau đó hỏi **subsystem nào có trách nhiệm ở từng bước**; cuối cùng tìm **bằng chứng phân biệt các giả thuyết**. Đừng suy một lớp bị hỏng chỉ từ tên lệnh hay một thông báo chung. Đó là mô hình sẽ dùng lại ở các bài về system call, bộ nhớ, I/O và xử lý sự cố.

## Đọc thêm

Tra `man 2 intro`, `man 2 read`, `man 7 hier`. Các nguồn chính để kiểm tra bài: [Linux Kernel Documentation](https://docs.kernel.org/), [VFS](https://docs.kernel.org/filesystems/vfs.html), [page cache](https://docs.kernel.org/mm/page_cache.html), [sysfs](https://docs.kernel.org/filesystems/sysfs.html), [man 2 read](https://man7.org/linux/man-pages/man2/read.2.html).
