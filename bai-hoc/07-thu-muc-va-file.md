# Bài 07 — Cây thư mục và các loại file

[Mục lục](../README.md) · [← Bài 06](06-terminal-va-shell.md) · [Bài 08 →](08-file-va-luong-du-lieu.md)

## Mục tiêu

Sau bài 06, dùng đường dẫn chính xác và hiểu dữ liệu nào bền vững, dữ liệu nào do kernel tạo ra. Chuẩn bị thư mục `~/linux-lab`.

Sau bài này, bạn có thể: phân giải một đường dẫn tuyệt đối hoặc tương đối; phân biệt cây **tên** với nơi dữ liệu được lưu; đọc loại file và metadata; giải thích symlink hỏng sau khi đổi tên file đích; và dùng `findmnt` để xác định filesystem chứa một đường dẫn. Tình huống xuyên suốt: bạn lưu báo cáo dưới `~/linux-lab/paths/data/`, tạo một tên tắt tới báo cáo, rồi đổi tên báo cáo. Bài 08 mới đi sâu vào sao chép, xóa và luồng dữ liệu.

**File** ở Linux là một đối tượng có tên trong filesystem; nó không nhất thiết là văn bản hay dữ liệu nằm trên SSD. **Filesystem** là cách tổ chức các đối tượng và nội dung; nó có thể ở ổ đĩa, RAM, mạng hoặc là giao diện do kernel tạo. **Đường dẫn** là chuỗi tên dùng để tìm một đối tượng, ví dụ `/home/linh/report.txt`; nó không phải địa chỉ vật lý của byte trên đĩa. Ba khái niệm này cần tách ra để hiểu vì sao đổi tên có thể làm hỏng symlink nhưng không nhất thiết làm mất nội dung báo cáo.

## 1. Một cây tên thống nhất

Linux có cây thư mục bắt đầu ở `/`. Một filesystem khác được gắn vào cây tại mount point; đường dẫn không nhất thiết cho biết dữ liệu nằm trên thiết bị nào. `/home` có thể cùng filesystem với `/` hoặc là mount riêng.

**Root directory** `/` là điểm bắt đầu của cây tên mà một tiến trình nhìn thấy. **Mount point** là thư mục nơi một filesystem khác được gắn vào cây ấy. Ví dụ minh họa: `/` ở filesystem A, còn `/home` ở filesystem B. Bạn vẫn truy cập `/home/linh/report.txt` như một đường dẫn liên tục; lúc tra tới `/home`, kernel chuyển sang filesystem B. Ngược lại, cùng một cấu trúc tên cũng có thể nằm hoàn toàn trên A. `findmnt -T /home/linh/report.txt` giúp xem mount **đang chứa đường dẫn đó**. Tên đường dẫn tự nó không chứng minh dữ liệu ở SSD nào, vì nguồn có thể là thiết bị ảo, LVM, mạng hoặc filesystem trong RAM. Xem [tài liệu VFS của kernel](https://docs.kernel.org/filesystems/vfs.html) và [findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html).

```text
Không gian tên mà tiến trình nhìn thấy
/
├── etc/                 ← có thể thuộc filesystem A
├── usr/                 ← có thể thuộc filesystem A
└── home/                ← mount point: từ đây tra trong filesystem B
    └── linh/
        └── report.txt
```

Đọc sơ đồ từ trên xuống: các đường dẫn đều bắt đầu trong cùng cây, nhưng tại mount point việc tra cứu chuyển sang filesystem được gắn. Hai nhãn A/B chỉ là **giả định để giải thích**, không phải kết quả máy bạn. Nếu mount một filesystem lên thư mục đã có dữ liệu, nội dung cũ bị che trong cây đang nhìn thấy chứ không tự bị xóa; [mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html) mô tả hành vi này. Lab chỉ **quan sát mount**, không tự gắn/tháo để tránh tác động dữ liệu.

Đường dẫn tuyệt đối bắt đầu bằng `/`; đường dẫn tương đối được giải từ working directory. `.` là thư mục hiện tại, `..` là cha. Symlink có thể khiến cách nhìn logic của shell khác đường dẫn vật lý; so sánh `pwd` với `pwd -P`.

**Working directory** là thư mục làm việc hiện tại của một tiến trình. Nếu shell đang ở `/home/linh/linux-lab/paths`, `data/report.txt` là đường dẫn tương đối đến `/home/linh/linux-lab/paths/data/report.txt`; còn `/etc/os-release` luôn bắt đầu từ `/` mà tiến trình thấy. `.` chỉ thư mục hiện tại, `..` chỉ thư mục cha trong quá trình phân giải. Dấu `~` trong Bash là cú pháp shell thường mở rộng thành home của user trước khi chương trình nhận đường dẫn; nó không phải một thư mục tên `~` trong mọi ngữ cảnh. Với tên có khoảng trắng, dùng quote như bài 06: `cd "$HOME/linux-lab/paths"`.

```text
working directory: /home/linh/linux-lab/paths
đầu vào:          ./data/../data/report.txt
tra từng phần:    . → data → .. → data → report.txt
kết quả ví dụ:    /home/linh/linux-lab/paths/data/report.txt
```

Đọc từ trái sang phải: kernel bắt đầu tại working directory vì đường dẫn không mở đầu bằng `/`, rồi tra từng thành phần. Trên đường đi, nó phải có quyền **search/execute** trên các thư mục cha; thành phần thiếu có thể báo `No such file or directory`, thành phần không phải thư mục có thể báo `Not a directory`, thiếu quyền đi qua có thể báo `Permission denied`. Symlink ở giữa đường có thể đổi hướng tra cứu. Đây là ví dụ đơn giản chưa có symlink hay mount ở các thành phần; xem quy tắc đầy đủ trong [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html).

`pwd` trong Bash có thể báo đường dẫn **logic** mà shell đã đi qua, còn `pwd -P` yêu cầu đường dẫn **physical** sau khi phân giải symlink thư mục. Hai kết quả chỉ khác khi đường đi có symlink phù hợp; nếu giống nhau thì chưa chứng minh máy không có symlink ở nơi khác. Bạn có thể tự kiểm tra bằng `pwd`, `pwd -P`, rồi xem một thư mục nghi là symlink với `ls -ld` và `readlink`.

| Đường dẫn | Nội dung điển hình |
|---|---|
| `/etc` | Cấu hình theo máy |
| `/usr` | Chương trình, thư viện và dữ liệu hệ thống |
| `/var` | Log, cache, spool, dữ liệu thay đổi |
| `/home`, `/root` | Home user thường và root |
| `/run` | Trạng thái runtime, thường không bền qua reboot |
| `/tmp` | File tạm; chính sách dọn tùy distro |
| `/dev` | Device node và một số giao diện thiết bị |
| `/proc`, `/sys` | Giao diện ảo đến kernel, tiến trình, thiết bị |

Trên hệ merged-usr, `/bin` hoặc `/lib` có thể là symlink vào `/usr`. Đừng suy luận đó là cấu hình hỏng.

Bảng nêu **vai trò thường gặp**, không khẳng định mọi distro có cùng bố cục hoặc cùng chính sách dọn dữ liệu. `/etc` thường chứa cấu hình theo máy; `/usr` chủ yếu chứa chương trình/thư viện/dữ liệu được phân phối; `/var` chứa dữ liệu thay đổi như log; `/run` là trạng thái của lần boot hiện tại; `/tmp` dùng cho file tạm và có thể bị dọn theo chính sách. `/home` là home user thường, còn `/root` là home của tài khoản root trên nhiều hệ, không phải thư mục gốc `/`. Muốn biết một đường dẫn **thực sự** nằm trên filesystem nào, dùng `findmnt -T`; muốn xem nó là symlink hay thư mục thật, dùng `ls -ld`. Xem [Filesystem Hierarchy Standard](https://xdg.pages.freedesktop.org/xdg-specs/fhs/latest-single/) và [hier(7)](https://man7.org/linux/man-pages/man7/hier.7.html).

“Bền vững” ở đây phải hiểu theo **cơ chế và chính sách cụ thể**, không suy từ tên thư mục. File trong `/run` thường không tồn tại qua reboot vì thường được tạo cho trạng thái runtime; file trong `/tmp` có thể bị dọn; file trong `/home` thường được kỳ vọng lưu lâu nhưng vẫn có thể mất do xóa, lỗi storage hoặc chính sách quản trị. `/proc` và `/sys` chủ yếu là giao diện tới trạng thái kernel, không phải log được lưu thành file thường. Để tự kiểm tra, xem `findmnt -T /run`, `findmnt -T /tmp`, `findmnt -T /proc` trên máy bạn rồi đọc cột `FSTYPE`; đừng lấy kết quả từ máy khác làm mặc định.

## 2. File không chỉ là văn bản

Regular file giữ chuỗi byte. Directory ánh xạ tên tới đối tượng filesystem. Symlink giữ đường dẫn đích và có thể bị dangling. FIFO, socket, character/block device có ngữ nghĩa I/O khác regular file.

Để cụ thể hơn: **regular file** thường là nội dung byte có thể đọc/ghi theo vị trí; **directory** là cấu trúc tra tên con, không nên đọc như file văn bản; **symlink** chứa một chuỗi đường dẫn trỏ tới tên khác, không phải bản sao dữ liệu đích. **FIFO** là kênh byte theo thứ tự để các tiến trình trao đổi; **socket** là đầu mối giao tiếp; **character device** và **block device** là giao diện tới thiết bị hoặc thiết bị ảo. Chúng cùng tham gia không gian tên file nhưng thao tác đọc/ghi có thể chặn, trả dữ liệu động hoặc có tác dụng phụ; không chạy `cat` tùy tiện lên device node. Các loại được kernel ghi trong metadata, xem [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html).

| Ký tự đầu của `ls -l` | Loại đối tượng | Ví dụ thường gặp và cách hiểu |
|---|---|---|
| `-` | Regular file | Báo cáo trong thư mục lab. |
| `d` | Directory | `data/` chứa tên các mục con. |
| `l` | Symlink | `report-link` giữ tên đường dẫn đích. |
| `p` | FIFO | Một đầu mối truyền byte giữa tiến trình. |
| `s` | Socket | Một đầu mối giao tiếp, ví dụ Unix domain socket. |
| `c`, `b` | Character, block device | Giao diện thiết bị, thường dưới `/dev`. |

Đọc **ký tự đầu**, không nhầm nó với chín ký tự quyền phía sau. Loại đối tượng do metadata quyết định, không do phần mở rộng `.txt`. Một `report.txt` có thể chứa byte nhị phân; ngược lại file không có đuôi vẫn có thể là văn bản. `file` thử nhận diện bằng metadata và dấu hiệu nội dung, nên kết quả là phân loại theo các phép thử của công cụ chứ không phải chứng minh mọi byte đều thuộc một định dạng. Xem [file(1)](https://man7.org/linux/man-pages/man1/file.1.html).

`ls -l` cho biết loại bằng ký tự đầu; `stat` cho metadata; `file` nhận diện nội dung theo dấu hiệu, không chỉ đuôi tên. Một file đuôi `.txt` vẫn có thể chứa dữ liệu nhị phân.

**Metadata** gồm inode number, loại, quyền, owner, kích thước, số hard link và các mốc thời gian. **Inode** là đối tượng metadata bên trong một filesystem; inode number chỉ duy nhất **trong filesystem đó**, không phải trên mọi ổ. Tên nằm trong directory và dẫn tới inode; đổi tên trong cùng filesystem có thể đổi tên tra cứu mà đối tượng bên dưới vẫn còn. **Hard link** là thêm một tên tới cùng inode, khác với symlink là một đối tượng chứa *đường dẫn* tới tên khác. Hard link thông thường không nối qua filesystem và không dùng để liên kết directory; bài này chỉ cần hiểu để khỏi nhầm với symlink. Xem [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html) và [symlink(7)](https://man7.org/linux/man-pages/man7/symlink.7.html).

Với symlink, `readlink report-link` cho biết **chuỗi được lưu trong link**; `stat report-link` trên GNU coreutils mặc định xem chính link, còn `stat -L report-link` xem đối tượng đích nếu còn tồn tại. `ls -l report-link` cho thấy `report-link -> data/report.txt`. So ba kết quả để biết đang hỏi về *link* hay *đích*. [GNU stat](https://www.gnu.org/software/coreutils/manual/html_node/stat-invocation.html) giải thích tùy chọn `-L`; công cụ trên hệ tối giản có thể khác.

## 3. Lab: đường dẫn, symlink và filesystem

```bash
mkdir -p "$HOME/linux-lab/paths/data"
cd "$HOME/linux-lab/paths"
printf 'sample\n' > data/report.txt
ln -s data/report.txt report-link
ls -l
stat data/report.txt
file data/report.txt
readlink report-link
findmnt -T data/report.txt
mv data/report.txt data/renamed.txt
cat report-link
```

Lệnh cuối thất bại vì symlink vẫn chứa đường dẫn cũ. Sửa bằng `ln -sfn data/renamed.txt report-link` rồi đọc lại. Symlink tương đối được giải từ thư mục chứa symlink, không từ thư mục của người gọi.

**Chuẩn bị:** chạy trong VM bài 05 bằng user thường, có `mkdir`, `ln`, `ls`, `stat`, `file`, `readlink`, `findmnt`, `mv`, `cat`. Không cần `sudo`. Lab sẽ tạo/ghi file trong `~/linux-lab/paths`; nếu đã có dữ liệu ở đó, chọn một thư mục lab mới và thay đường dẫn ở các lệnh trước khi chạy. `printf ... > data/report.txt` **ghi đè** file cùng tên; `ln -s` thất bại nếu `report-link` đã tồn tại. Vì vậy chạy lab trên thư mục mới hoặc xóa *đúng file lab của mình* trước khi lặp lại, không dùng lệnh xóa hàng loạt.

**Cách đọc theo thứ tự:**

1. `mkdir -p` tạo đường dẫn thư mục; `cd` đặt working directory để những đường dẫn tương đối phía sau được hiểu từ `paths/`. `printf` tạo báo cáo minh họa chứa `sample` và ký tự xuống dòng.
2. `ln -s data/report.txt report-link` tạo symlink tên `report-link`. Chuỗi `data/report.txt` được hiểu từ **thư mục chứa link** (`paths/`), không từ nơi bạn chạy `cat` sau này. `ls -l` nên có một dòng bắt đầu `l` và hiện `report-link -> data/report.txt`. [ln(1)](https://man7.org/linux/man-pages/man1/ln.1.html) xác nhận quy tắc đích tương đối.
3. `stat data/report.txt` hiển thị metadata của file đích. Tìm `Size`, `Inode`, loại và quyền; giá trị inode/kích thước hiển thị phụ thuộc filesystem và nội dung. `file data/report.txt` có thể gọi đó là text theo phép thử nội dung; điều này không đến từ đuôi `.txt`.
4. `readlink report-link` in đúng chuỗi `data/report.txt`, **chưa kiểm tra đích có tồn tại**. `findmnt -T data/report.txt` chỉ mount chứa file; đọc `TARGET`, `SOURCE`, `FSTYPE`. `TARGET` là mount point, không nhất thiết là chính file. `SOURCE` có thể là thiết bị, tên ảo hoặc một nguồn khác; không tự kết luận “SSD thật”. [findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html) nêu `--target` nhận cả file và thư mục.
5. `mv` đổi tên file đích. Bây giờ `readlink report-link` vẫn in `data/report.txt`, còn `cat report-link` thường báo `No such file or directory` và trả status khác 0. Đây là **lỗi dự kiến** để học cơ chế; tên cũ đã biến mất. Kiểm tra thêm `ls -l report-link`, `ls -l data/renamed.txt`, và `test -e report-link; printf 'target-exists=%s\n' "$?"`: với link hỏng, `test -e` thường trả `1` dù link vẫn tồn tại; `test -L report-link` xác nhận chính link còn đó.

Đầu ra **minh họa**, không phải quan sát thật trên máy bạn:

```text
$ readlink report-link
data/report.txt
$ cat report-link
cat: report-link: No such file or directory
```

Để sửa, ngay trong `paths/` chạy `ln -sfn data/renamed.txt report-link`, rồi `readlink report-link` và `cat report-link`. `-s` tạo symlink, `-f` thay tên link cũ, `-n` tránh xử lý tên đích như thư mục khi link cũ trỏ tới directory trên GNU `ln`; ở lab này nó trỏ tới file. Kỳ vọng `readlink` in `data/renamed.txt` và `cat` in `sample`. Chỉ dùng `-f` sau khi đã xác nhận `report-link` là link lab của bạn, vì nó thay mục cũ. Một cách không ghi đè là tạo link mới `ln -s data/renamed.txt report-fixed` để so sánh link hỏng và link đúng. Symlink trỏ theo **tên** nên đổi tên đích có thể làm hỏng nó; hard link tới cùng inode không có cơ chế này, nhưng có giới hạn filesystem khác.

Quan sát `ls /proc/self`, `cat /proc/uptime`, `ls /sys/class/net`. Không ghi vào các pseudo-file khi chưa biết tác dụng; một số file là giao diện điều khiển kernel.

**Pseudo-filesystem** là filesystem tạo giao diện dạng file tới trạng thái sống của kernel. `/proc/self` trỏ tới thông tin của **tiến trình đang truy cập**, vì vậy nó có thể khác giữa lần gọi `ls` và chương trình khác; `/proc/uptime` trả hai số giây, lần lượt là uptime hệ thống và thời gian idle tích lũy theo định nghĩa kernel. `/sys/class/net` cho thấy các lớp giao diện mạng kernel công bố; trong VM tên card có thể khác và thư mục không phải danh sách đầy đủ thiết bị vật lý. So `findmnt -T /proc/uptime -o TARGET,SOURCE,FSTYPE` và `findmnt -T /sys/class/net -o TARGET,SOURCE,FSTYPE` để thấy loại filesystem đang cung cấp chúng. Các phép quan sát không chứng minh file nằm thành byte cố định trên SSD. Xem [tài liệu procfs](https://docs.kernel.org/filesystems/proc.html), [proc_uptime(5)](https://man7.org/linux/man-pages/man5/proc_uptime.5.html) và [tài liệu sysfs](https://docs.kernel.org/filesystems/sysfs.html).

## 4. Mẹo và lỗi thường gặp

- File bắt đầu bằng dấu chấm được ẩn theo quy ước hiển thị; đó không phải cơ chế bảo mật.
- Mount lên thư mục có dữ liệu sẽ che dữ liệu cũ trong cây nhìn thấy, không tự xóa nó.
- Permission denied có thể do thiếu quyền đi qua một thư mục cha, không chỉ quyền file đích.
- `readlink` in ra đích nhưng `cat` thất bại: link chỉ chứa chuỗi tên; dùng `ls -l` và kiểm tra từng thành phần của đích từ **thư mục chứa link**. Đích có thể đã bị đổi tên, thiếu quyền hoặc nằm dưới mount khác.
- `No such file or directory` chưa chắc tên cuối sai: một thư mục trung gian hoặc đích của symlink ở giữa có thể không tồn tại. Kiểm tra từ trái sang phải; xem [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html).
- Dựa vào đuôi `.txt` để quyết định nội dung: dùng `file` làm gợi ý phân loại; trước khi xử lý dữ liệu quan trọng, xác nhận định dạng theo ứng dụng tạo file.
- Thấy `/bin` là symlink hoặc `/tmp` là `tmpfs` rồi nghĩ máy hỏng: kiểm tra `ls -ld /bin` và `findmnt -T /tmp`; cấu hình phụ thuộc distro.

## 5. Kiểm tra đạt

Giải thích được symlink hỏng trong lab và vị trí filesystem thật bằng `findmnt`. Trả lời: `/proc/uptime` có cần chiếm dung lượng trên SSD như log không? **Không; đây là dữ liệu do kernel cung cấp qua pseudo-filesystem.**

Tự trả lời thêm trước khi xem gợi ý:

1. Đang ở `~/linux-lab/paths`, `data/../data/report.txt` bắt đầu tra từ đâu? **Từ working directory**, vì không bắt đầu bằng `/`; từng thành phần được phân giải theo thứ tự.
2. `readlink report-link` in `data/report.txt` có chứng minh file đích tồn tại không? **Không.** Nó chỉ cho biết chuỗi lưu trong link; dùng `test -e`, `stat -L` hoặc thử mở đích để kiểm tra tiếp.
3. `findmnt -T ~/linux-lab/paths/data/renamed.txt` báo `TARGET=/home`. Có nghĩa file tên `/home` không? **Không.** `/home` là mount point của filesystem đang chứa file; đường dẫn file vẫn nằm sâu hơn trong cây.
4. `ls -l` hiện `-rw-r--r--` cho một file nhưng bạn vẫn bị `Permission denied` khi đi theo đường dẫn. Vì sao? **Có thể thiếu quyền search trên thư mục cha** hoặc có chính sách khác; quyền file đích chưa đủ kết luận.
5. File dưới `/tmp` có chắc biến mất sau reboot không? **Không chắc.** Chính sách dọn và loại filesystem phụ thuộc máy; kiểm tra mount và chính sách distro.

## Tóm tắt mô hình tư duy

```text
Đường dẫn = chuỗi tên để tra cứu
  → đi từ / hoặc working directory qua từng thư mục
  → có thể qua symlink và mount point
  → tới một đối tượng có loại, metadata và nội dung/ngữ nghĩa riêng
```

Đọc sơ đồ từ trên xuống: **tên** cho biết cách tìm; symlink có thể đổi sang tên khác, mount đổi filesystem đứng sau một nhánh cây; đối tượng cuối có thể là regular file, thư mục, thiết bị hoặc giao diện kernel. Muốn biết thật trên máy, kết hợp `pwd`, `ls -l`, `stat`, `readlink`, `file` và `findmnt`; mỗi lệnh trả lời một câu hỏi khác nhau.

## Đọc thêm

- [Filesystem Hierarchy Standard](https://xdg.pages.freedesktop.org/xdg-specs/fhs/latest-single/) và [hier(7)](https://man7.org/linux/man-pages/man7/hier.7.html): vai trò các nhánh thường gặp.
- [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html), [symlink(7)](https://man7.org/linux/man-pages/man7/symlink.7.html), [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html): cách tra tên và metadata.
- [findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html), [file(1)](https://man7.org/linux/man-pages/man1/file.1.html): quan sát mount và phân loại nội dung.
