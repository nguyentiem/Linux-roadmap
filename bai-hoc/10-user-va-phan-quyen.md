# Bài 10 — User, group và quyền truy cập

[Mục lục](../README.md) · [← Bài 09](09-xu-ly-van-ban.md) · [Bài 11 →](11-package-va-thu-vien.md)

## Mục tiêu

Bạn đã biết tìm file, đọc văn bản và chuyển hướng dữ liệu ở bài 07–09. Nhưng tại sao cùng một file, có người đọc được còn người khác gặp `Permission denied`? Tại sao file chỉ đọc vẫn bị xóa? Và tại sao vừa thêm người dùng vào nhóm mà phiên đang mở vẫn không truy cập được?

Bài này dùng tình huống xuyên suốt: Alice cần viết ghi chú trong thư mục dùng chung của nhóm `labteam`, còn người ngoài nhóm không được truy cập. Sau bài học, bạn cần:

- Phân biệt tài khoản được cấu hình với danh tính của chương trình thực sự đang chạy.
- Đọc được chủ sở hữu, nhóm và các quyền `rwx`; giải thích khác biệt giữa quyền file và quyền thư mục.
- Dự đoán quyền khi tạo file với `umask`, và hiểu vai trò setgid, sticky bit, ACL.
- Tạo thư mục cộng tác trong máy thực hành, kiểm tra truy cập bằng đúng người dùng, tạo lỗi rồi khôi phục.
- Chẩn đoán theo từng tầng thay vì cấp quyền `777` cho mọi thứ.

**Môi trường:** Linux trong **VM (máy ảo)**, tức một máy thực hành chạy trên máy chủ nhưng có hệ điều hành và dữ liệu riêng, với quyền dùng `sudo`. `sudo` là công cụ chạy một lệnh dưới danh tính khác theo chính sách cho phép, thường là `root`. Phần lab quản trị dùng các công cụ shadow-utils như `useradd`, `usermod`, công cụ GNU và `/bin/bash`; thiết bị nhúng dùng BusyBox có thể khác tên lệnh/tùy chọn. Có phần thử cơ bản không cần tạo tài khoản, và phần ACL tùy chọn nếu hệ thống hỗ trợ.

Lệnh trong bài là hướng dẫn thực hành, không phải thông báo rằng các tài khoản ấy đã được tạo trên máy của bạn. Đầu ra ghi **minh họa** có tên, số ID và thời gian có thể khác khi tự chạy.

## 1. Linux đang quyết định quyền cho ai?

### 1.1. User và group giải quyết vấn đề gì?

**User (người dùng/tài khoản)** là danh tính dùng để phân biệt người hoặc dịch vụ trên hệ thống. Tài khoản `alice` có thể đại diện cho một người; tài khoản của web server đại diện cho dịch vụ, không nhất thiết có người đăng nhập trực tiếp. Nhờ tách danh tính, lỗi của một dịch vụ không mặc nhiên cho nó quyền sửa file của mọi người.

**Group (nhóm)** gom các danh tính để cấp quyền chung. Thay vì cấp riêng cho từng người trong đội, bạn có thể đặt file thuộc nhóm `labteam` rồi cho nhóm quyền đọc/ghi. Một file có một chủ sở hữu user và một nhóm sở hữu; điều đó không có nghĩa chỉ thành viên nhóm ấy mới có mọi quyền với file — còn phải xét các lớp quyền và cơ chế bổ sung.

**UID (user ID)** là số nhận diện người dùng; **GID (group ID)** là số nhận diện nhóm. Kernel chủ yếu kiểm tra những con số này, không dựa vào cách tên `alice` được viết. **Kernel (nhân hệ điều hành)** là phần lõi quản lý tài nguyên và xử lý yêu cầu đọc/ghi file của chương trình.

```bash
id
id -u
id -g
id -G
```

`id` xem danh tính hiện tại; `-u` in UID hiệu lực, `-g` in GID hiệu lực, `-G` in các GID nhóm. **Minh họa:**

```text
uid=1000(alice) gid=1000(alice) groups=1000(alice),1050(labteam)
```

Ở đây tên trong ngoặc giúp người đọc; 1000 và 1050 mới là giá trị số dùng để đối chiếu. Các số là ví dụ, không dùng chúng thay cho kết quả thật. `root` thường có UID 0, là danh tính quản trị; không kết luận mọi tài khoản tên “admin” đều tương đương root.

### 1.2. Tên được tra cứu từ đâu, khác gì với tiến trình đang chạy?

**User space (không gian chương trình thông thường)** là nơi các công cụ như shell, `id`, `getent` chạy, bên ngoài phần lõi kernel. Chúng tra tên và thông tin tài khoản qua cơ chế của hệ thống. Với hệ dùng GNU C Library, **NSS (Name Service Switch)** là cơ chế chọn nguồn tra cứu tên, có thể từ file cục bộ hoặc dịch vụ danh tính bên ngoài.

```bash
getent passwd "$(id -u)"
getent group "$(id -g)"
```

`getent` truy vấn cơ sở dữ liệu danh tính mà hệ thống biết; `passwd` ở đây là tên cơ sở dữ liệu tài khoản, không phải yêu cầu in mật khẩu. `$(...)` lấy đầu ra lệnh bên trong để làm đối số. Một dòng tài khoản thường có dạng:

```text
alice:x:1000:1000:Alice:/home/alice:/bin/bash
```

Các phần phân cách bằng `:` lần lượt là tên, trường chỉ báo mật khẩu, UID, GID chính, mô tả, thư mục cá nhân và shell đăng nhập. **Shell** là chương trình diễn giải lệnh; `/bin/bash` là một shell cụ thể. `x` thường cho biết thông tin kiểm chứng mật khẩu nằm ở nơi được bảo vệ riêng, không phải mật khẩu thật. Một tài khoản tồn tại chưa chứng minh nó có mật khẩu dùng được hay được phép đăng nhập.

`/etc/passwd` và `/etc/group` là nguồn cục bộ phổ biến, nhưng đọc riêng chúng có thể bỏ sót tài khoản từ nguồn khác; vì vậy dùng `getent` để kiểm tra tên trước lab. Ngược lại, tra cứu thất bại có thể do nguồn danh tính ngoài đang lỗi, không luôn là bằng chứng chắc chắn rằng tên chưa từng tồn tại. Xem [getent(1)](https://man7.org/linux/man-pages/man1/getent.1.html).

**Process (tiến trình)** là chương trình đang thực thi, có danh tính riêng để kernel kiểm tra. Shell của bạn cũng là một tiến trình; lệnh được chạy từ shell thường kế thừa danh tính của nó. Quyền không được quyết định đơn thuần bằng tên người vừa gõ bàn phím.

### 1.3. Nhóm chính, nhóm bổ sung và nhóm của phiên cũ

**Primary group (nhóm chính)** là nhóm chính của tài khoản, dùng để khởi tạo GID của phiên. **Supplementary groups (nhóm bổ sung)** là danh sách nhóm khác mà tiến trình thuộc về, được dùng trong kiểm tra quyền. Ví dụ Alice có nhóm chính `alice` và nhóm bổ sung `labteam`, nên có thể được xét quyền nhóm trên một file thuộc `labteam`.

```bash
id
id labalice
sudo -u labalice id
```

Ba câu hỏi khác nhau:

- `id` không ghi tên xem danh tính mà lệnh hiện tại nhận từ phiên đang dùng.
- `id labalice` tra thông tin tài khoản/nhóm cho tên ấy từ cơ sở dữ liệu; không xem mọi tiến trình Alice đang chạy.
- `sudo -u labalice id` chạy một lệnh mới dưới danh tính Alice theo chính sách sudo rồi xem danh tính lệnh đó. Hãy đọc danh sách nhóm thực tế vì chính sách có thể ảnh hưởng cách khởi tạo nhóm.

Nếu quản trị viên vừa thêm nhóm, cơ sở dữ liệu đã đổi nhưng tiến trình shell cũ có thể còn giữ danh sách nhóm cũ. Đăng nhập phiên mới rồi chạy `id` để xác nhận. Chạy `bash` từ shell cũ thường chỉ kế thừa danh tính cũ, không thay thế việc đăng nhập lại. `newgrp` có thể tạo phiên với nhóm khác trong các trường hợp phù hợp, nhưng cũng thay GID và môi trường; không dùng nó mà bỏ qua kiểm tra `id`.

### 1.4. “Danh tính hiệu lực” nghĩa là gì?

**Real UID/GID (ID thực)** ghi danh tính nền của tiến trình; **effective UID/GID (ID hiệu lực)** là danh tính dùng cho nhiều kiểm tra đặc quyền. Linux còn có **filesystem UID/GID**, ID dùng cho kiểm tra truy cập file, thông thường bằng ID hiệu lực. Bài lab không thay riêng filesystem ID, nên có thể dùng ID hiệu lực làm mô hình thực hành.

Có thể xem các giá trị của shell trên Linux:

```bash
grep -E '^(Uid|Gid|Groups):' /proc/$$/status
```

`$$` là mã số tiến trình của shell; `/proc` là cây thông tin do kernel cung cấp về hệ thống đang chạy. Dòng `Uid:` và `Gid:` có bốn cột: thực, hiệu lực, saved và filesystem. **Saved ID (ID được lưu)** phục vụ chương trình chuyển qua lại giữa danh tính đặc quyền và danh tính thông thường; chưa cần tự thay nó trong bài này. Dòng `Groups:` là danh sách nhóm bổ sung. Xem [credentials(7)](https://man7.org/linux/man-pages/man7/credentials.7.html) và [proc_pid_status(5)](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html).

Không dùng `id` ở terminal của bạn để kết luận danh tính một dịch vụ khác. Dịch vụ có thể chạy bằng user riêng; cần xem tiến trình đó hoặc cấu hình khởi chạy. Trong container, UID có thể được ánh xạ sang UID khác bên ngoài; tên giống nhau giữa hai môi trường chưa chứng minh cùng quyền.

## 2. Đọc quyền file: ai được làm thao tác gì?

### 2.1. Đọc `ls -l` từ trái sang phải

**Permission (quyền truy cập)** là quy tắc cho phép hoặc từ chối thao tác trên một đối tượng. **File thông thường (regular file)** chứa nội dung như văn bản hoặc chương trình. **Directory (thư mục)** chứa các mục tên để tìm tới file hoặc thư mục con.

```bash
ls -l note.txt
ls -ld team-dir
ls -ln note.txt
```

`-l` in chi tiết; `-d` xem bản thân thư mục thay vì liệt kê nội dung; `-n` hiện UID/GID bằng số. **Minh họa:**

```text
-rw-r----- 1 alice labteam 6 Sep 26 10:00 note.txt
```

Đọc phần đầu thành bốn phần:

```text
- | rw- | r-- | ---
^   ^     ^     ^
loại owner group other
```

Ký tự đầu `-` là file thông thường, `d` là thư mục. Ba nhóm sau là **owner (chủ sở hữu)**, **group (nhóm sở hữu)** và **other (những danh tính không khớp hai lớp trên)**. `r` là read/đọc, `w` là write/ghi, `x` là execute/thực thi với file hoặc search/tìm thành phần với thư mục; `-` biểu thị bit quyền không được cấp.

Ở ví dụ: Alice đọc/ghi, thành viên `labteam` khác Alice chỉ đọc, người ngoài không được đọc/ghi/thực thi theo quyền cơ bản. Số `1` là số hard link, tức số tên liên kết cứng tới đối tượng file; `6` là kích thước nội dung tính bằng byte. Các cột ngày và định dạng có thể khác locale, thiết lập ngôn ngữ của máy. Dấu `+` sau chuỗi quyền thường báo có ACL mở rộng, sẽ học ở mục 6; khi đó không đọc ba nhóm như toàn bộ chính sách.

### 2.2. Hệ thống chọn một lớp, không cộng tùy ý

Trong mô hình quyền cơ bản, không có ACL mở rộng và không có đặc quyền vượt qua kiểm tra:

1. UID truy cập khớp UID chủ file → dùng lớp owner.
2. Nếu không khớp owner, GID hiệu lực hoặc một nhóm bổ sung khớp nhóm sở hữu file → dùng lớp group.
3. Nếu không khớp cả hai → dùng lớp other.
4. Lớp đã chọn có quyền cần thiết thì cho phép; thiếu quyền thì từ chối, không chuyển sang lớp rộng hơn để thử lại.

Ví dụ file thuộc Alice có mode `0040`, nghĩa là owner không có quyền, group có đọc, other không có quyền. Alice **không** đọc được chỉ nhờ cũng thuộc nhóm sở hữu: owner đã được chọn và không có `r`. Tự kiểm tra bằng file riêng trong lab cơ bản ở mục 7.1. Đây là lý do không “cộng owner + group + other” để đoán quyền.

Quy tắc này là kiểm tra quyền truyền thống. ACL thêm mục user/nhóm cụ thể và mask; đặc quyền, chính sách bảo mật hoặc filesystem chỉ đọc có thể làm kết luận khác. Mô hình kiểm tra được mô tả trong [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html).

### 2.3. Số `640`, `755` và `2770` được tạo thế nào?

**Bit quyền** là một cờ bật/tắt cho một quyền. Biểu diễn **octal (hệ cơ số 8)** gom ba bit thành một chữ số; trong mỗi lớp, `r=4`, `w=2`, `x=1`:

| Chữ số | Quyền | Cách ghép |
|---|---|---|
| 0 | `---` | Không cấp bit nào |
| 1 | `--x` | Chỉ x |
| 2 | `-w-` | Chỉ w |
| 3 | `-wx` | 2 + 1 |
| 4 | `r--` | Chỉ r |
| 5 | `r-x` | 4 + 1 |
| 6 | `rw-` | 4 + 2 |
| 7 | `rwx` | 4 + 2 + 1 |

Vì vậy `640` là owner 6, group 4, other 0. `755` là owner đủ quyền, group và other đọc/tìm hoặc thực thi. Chữ số đứng trước ba lớp dùng cho bit đặc biệt: 4 là setuid, 2 là setgid, 1 là sticky; có thể ghép chúng. `2770` có setgid cùng quyền `rwxrwx---`. Không đọc nó như số thập phân 2770. Với GNU `chmod`, mode số ngắn như `755` có thể giữ setuid/setgid đang có trên **thư mục**, nên không mặc định ba chữ số sẽ xóa mọi bit đặc biệt. Muốn gỡ riêng setgid có thể dùng `chmod g-s thư-mục-lab` rồi kiểm tra lại; xem [GNU: Directory Setuid and Setgid](https://www.gnu.org/software/coreutils/manual/html_node/Directory-Setuid-and-Setgid.html).

**`chmod`** thay các bit quyền/mode của đối tượng:

```bash
chmod 640 note.txt
chmod g+w note.txt
chmod o-rwx note.txt
stat -c '%a %A %U:%G %n' note.txt
```

`g+w` thêm ghi cho nhóm, `o-rwx` bỏ cả ba quyền của other; `u`, `g`, `o` là owner, group, other. `stat -c` của GNU in theo mẫu: `%a` mode dạng octal, `%A` dạng chữ, `%U:%G` tên chủ/nhóm, `%n` tên file. Luôn kiểm tra sau khi sửa. Chỉ chủ sở hữu hoặc tiến trình có đặc quyền phù hợp mới được đổi mode; quyền `w` trên nội dung không tự cho phép đổi mode.

**`chown`** đổi chủ sở hữu và có thể đổi nhóm; **`chgrp`** đổi nhóm. Đổi owner thường cần đặc quyền; owner thông thường chỉ được đổi nhóm theo các điều kiện cho phép, thường là nhóm mình thuộc về. Ví dụ `sudo chown root:labteam thư-mục-lab` đổi cả hai, không cấp quyền `rwx` mới. Mode, owner và group là các thông tin khác nhau. Xem [GNU Coreutils: Changing file attributes](https://www.gnu.org/software/coreutils/manual/html_node/Changing-file-attributes.html) và [chmod(2)](https://man7.org/linux/man-pages/man2/chmod.2.html).

## 3. Quyền trên file và thư mục khác nhau vì chúng bảo vệ việc khác nhau

### 3.1. File: đọc nội dung, ghi nội dung, chạy chương trình

| Quyền | Với file thông thường | Ví dụ thao tác |
|---|---|---|
| `r` | Đọc byte nội dung | `cat note.txt` |
| `w` | Sửa nội dung, có thể làm rỗng | `printf 'new\n' > note.txt` |
| `x` | Cho phép yêu cầu chạy file như chương trình | `./tool` |

`x` không tự biến văn bản bất kỳ thành chương trình chạy được; nội dung phải có định dạng hợp lệ và môi trường chạy phù hợp. **Script** là file chứa lệnh cho một bộ diễn giải như Bash; `bash script.sh` để Bash **đọc** file script, nên không cần x trên script theo cùng cách `./script.sh` cần. Điều đó không cho phép vượt qua quyền đọc script hay quyền đi qua thư mục cha.

Có `w` không tự có `r`: một file có thể được phép ghi nhưng không đọc. Nhiều trình soạn thảo còn ghi file tạm rồi đổi tên, nên thao tác “lưu” có thể cần quyền thư mục chứ không chỉ `w` trên file cũ. Phải xem thao tác thực tế thay vì đoán theo tên ứng dụng.

### 3.2. Thư mục: danh sách tên khác với khả năng tìm tên đã biết

**Entry (mục thư mục)** là một liên kết giữa tên và đối tượng file/thư mục. **Search/traverse (tìm/đi qua)** là quyền dùng một thành phần của đường dẫn để tìm tới thành phần tiếp theo.

| Quyền | Với thư mục | Ví dụ và giới hạn |
|---|---|---|
| `r` | Đọc danh sách tên bên trong | `ls thư-mục`; chưa chắc đọc được thông tin/nội dung các file |
| `x` | Tìm tên đã biết, đi qua thư mục | `cat thư-mục/note.txt`, vẫn cần r trên file |
| `w` | Thay đổi các mục tên | Tạo, xóa, đổi tên; thông thường cần cùng x |

Vì vậy `r` và `x` không đồng nghĩa. Thư mục có `x` nhưng không `r`: biết tên `note.txt` thì có thể đọc nó nếu file cho phép, nhưng không liệt kê toàn bộ tên. Thư mục có `r` mà không `x`: có thể đọc tên, nhưng lấy chi tiết file hoặc mở theo tên có thể bị từ chối; `ls -l` có thể hiện lỗi hoặc dấu `?` ở các trường. Dùng `ls -1` khi chỉ thử liệt kê tên để không lẫn với thao tác đọc thông tin chi tiết.

### 3.3. Đường dẫn có nhiều “cửa”, không chỉ một cửa cuối

Với `/srv/linux-team-lab/note.txt`, mở để đọc cần đi qua từng thư mục và cuối cùng đọc file:

```text
Tiến trình Alice: UID, GID, nhóm bổ sung
                 |
                 v
              /                 cần x để tìm srv
                 |
                 v
              /srv              cần x để tìm linux-team-lab
                 |
                 v
       /srv/linux-team-lab      cần x để tìm note.txt
                 |
                 v
              note.txt          cần r để đọc nội dung
```

Mỗi mũi tên là một bước tìm theo tên; thiếu quyền đi qua ở một thư mục cha có thể chặn trước khi kernel xét quyền file. Mô hình trên dành cho mở đường dẫn mới, không suy ra mọi thay đổi mode lập tức vô hiệu một FD đã mở. **FD (file descriptor)** là số hiệu tài nguyên đã mở mà tiến trình dùng để tiếp tục đọc/ghi; đã học ở bài 08.

```bash
namei -l /srv/linux-team-lab/note.txt
```

`namei` tách đường dẫn thành các thành phần, `-l` hiện quyền và owner/group từng thành phần. Đây là công cụ xem cấu trúc/quyền cơ bản, không tính toàn bộ quyền hiệu lực có ACL, đặc quyền hay chính sách bảo mật. Đọc kết quả từ `/` tới file cuối, xác định đúng thư mục chặn truy cập. Nếu có **symbolic link (liên kết tượng trưng)**, tức đối tượng chứa đường dẫn dẫn tới một tên khác, phải kiểm tra đường dẫn đích cũng như phần ban đầu.

### 3.4. Vì sao file chỉ đọc vẫn xóa được?

Xóa tên bằng `rm` thay đổi mục trong **thư mục cha**. Nó không cần sửa nội dung file trước. Nếu có `w+x` trên thư mục cha, người dùng có thể xóa tên file chỉ đọc, trừ khi bị chặn bởi sticky bit hoặc cơ chế khác.

Ngược lại, có `w` trên file nhưng không có quyền thay mục thư mục thì có thể sửa nội dung mà không xóa tên. `rm` đôi khi hỏi xác nhận khi file không writable trong phiên tương tác; câu hỏi của công cụ không phải phép kiểm tra quyền bổ sung của kernel. Trong lab dùng `rm -f` trên đúng file thử để bỏ câu hỏi và quan sát cơ chế, không dùng cho dữ liệu thật chưa kiểm tra.

Gỡ tên cũng không bảo đảm dữ liệu biến mất ngay: còn tên hard link khác hoặc tiến trình đang mở thì đối tượng có thể còn tồn tại. Xem [unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html).

## 4. File mới lấy quyền từ đâu: `umask` không phải phép trừ số

### 4.1. Chương trình yêu cầu quyền, `umask` loại bớt

**Mode yêu cầu** là các bit quyền chương trình đưa ra khi tạo đối tượng. **`umask` (mặt nạ quyền khi tạo)** là các bit cần bỏ khỏi mode yêu cầu trong trường hợp không có default ACL. Nó thuộc tiến trình và được kế thừa khi chạy chương trình con; không phải một thuộc tính áp lên mọi file đã có.

```bash
umask
umask -S
```

Trong Bash, lệnh đầu in dạng số, `-S` in dạng chữ thể hiện quyền được phép giữ. Ví dụ mask `0022` bỏ w của group và other. Quy tắc bit là:

```text
quyền ban đầu = mode ứng dụng yêu cầu & phần bù của umask
```

`&` ở công thức là phép AND bit: giữ bit chỉ khi ứng dụng yêu cầu và mặt nạ không loại nó. Đây không phải phép toán cần gõ nguyên vào shell.

| Yêu cầu ứng dụng | umask | Kết quả cơ bản | Giải thích |
|---|---|---|---|
| `0666` | `0022` | `0644` | Bỏ w nhóm và other |
| `0777` | `0022` | `0755` | Bỏ w nhóm và other, giữ x đã yêu cầu |
| `0666` | `0002` | `0664` | Nhóm được ghi, other không được ghi |
| `0666` | `0077` | `0600` | Chỉ owner giữ đọc/ghi |
| `0600` | `0000` | `0600` | Mask không tự thêm quyền ứng dụng không yêu cầu |

Các công cụ tạo văn bản thường yêu cầu 0666, tạo thư mục thường yêu cầu 0777. Không phải mọi chương trình đều dùng hai giá trị này: `mktemp` thường tạo file 0600 và thư mục 0700. Với yêu cầu 0666, mask 0000 vẫn không tạo x; đây là câu trả lời cho việc file text không tự executable.

Ví dụ chứng minh không dùng phép trừ: yêu cầu 0666, mask 0001 vẫn giữ 0666 vì bit x của other vốn chưa được yêu cầu. “0666 trừ 0001” ra 0665 sẽ sai. Xem [umask(2)](https://man7.org/linux/man-pages/man2/umask.2.html).

### 4.2. Đổi `umask` có sửa quyền file cũ không?

Không. Thử trong subshell để chỉ đổi mặt nạ của nhóm thử:

```bash
(
    umask 0077
    printf 'private\n' > private.txt
    mkdir private-dir
    stat -c '%a %n' private.txt private-dir
)
```

**Subshell** là môi trường shell con chạy nhóm `(...)`; đổi umask bên trong không đổi shell ngoài. **Minh họa:** 600 cho file, 700 cho thư mục, khi tên mới chưa có và thư mục cha không có default ACL. Đổi umask sau đó không sửa hai đối tượng; `>` lên file đã có thường giữ mode của đối tượng ấy dù làm rỗng nội dung.

Có default ACL trên thư mục cha thì Linux xác định quyền ban đầu theo ACL kế thừa và mode yêu cầu, không áp dụng đơn giản công thức umask ở trên. Ứng dụng cũng có thể đổi mode sau tạo. Vì vậy đo bằng `stat`/`getfacl` thay vì chỉ nhìn `umask` để kết luận quyền cuối.

## 5. Ba bit đặc biệt: tránh lẫn cơ chế cộng tác với nâng đặc quyền

### 5.1. Setgid trên thư mục giữ nhóm sở hữu của file mới

**Setgid** là bit đặc biệt có hai vai trò tùy đối tượng. Trên thư mục Linux thông thường, nó giúp đối tượng mới tạo bên trong nhận nhóm sở hữu của thư mục; thư mục con mới cũng thường kế thừa setgid. Trên file chương trình thực thi, setgid liên quan đến đổi GID hiệu lực, không phải cơ chế chia sẻ thư mục.

```bash
sudo chmod 2770 /srv/linux-team-lab
ls -ld /srv/linux-team-lab
```

**Minh họa:** `drwxrws--- root labteam ...`. `s` ở vị trí x của group cho biết setgid bật và group x cũng bật; `S` viết hoa cho biết setgid bật nhưng group x tắt. Giá trị 2770 vừa cấp quyền owner/group, vừa bật setgid.

Alice có nhóm chính `labalice` nhưng file **mới tạo** ở đây nhận nhóm `labteam`. Muốn người cùng nhóm ghi được còn cần mode phù hợp: setgid không tự thêm `g+w`. `umask 0002` với yêu cầu 0666 thường cho 0664; nếu muốn other không có quyền trên file thì chọn 0007 cho 0660. Thư mục 2770 đã chặn người ngoài đi qua, nhưng quyền file vẫn quan trọng khi file được đưa nơi khác.

Giới hạn: đổi setgid không tự sửa nhóm/quyền của mọi file cũ. Chuyển file vào bằng `mv` trong cùng filesystem thường giữ đối tượng và nhóm cũ, không giống tạo mới. Sao chép giữ metadata bằng `cp -a` cũng có thể đưa nhóm/quyền nguồn vào. Một số filesystem hoặc chính sách nhóm khác có thể ảnh hưởng; kiểm tra bằng `stat`.

### 5.2. Sticky bit hạn chế xóa/đổi tên trong thư mục chung

**Sticky bit** trên thư mục hạn chế việc gỡ/đổi tên mục: trong điều kiện thông thường, cần là chủ file, chủ thư mục hoặc có đặc quyền phù hợp, ngoài các quyền cần thiết khác. Đây là lý do thư mục `/tmp` thường có mode 1777: mọi người tạo file được, nhưng không tùy ý xóa file của người khác.

```bash
ls -ld /tmp
```

**Minh họa phổ biến:** `drwxrwxrwt`; `t` thay vị trí x của other nghĩa sticky và x đều bật. `T` nghĩa sticky bật nhưng x tắt. Kết quả thực tế có thể khác trong môi trường riêng.

Sticky bit **không** ngăn sửa nội dung nếu bản thân file cấp w, cũng không thay thế việc bảo vệ đọc file. Nếu muốn nhóm cộng tác không xóa ghi chú của nhau, có thể cân nhắc 3770 (setgid + sticky + 770), nhưng owner của file vẫn được xóa file mình và owner thư mục vẫn có quyền quản lý. Không đặt sticky theo thói quen rồi cho rằng mọi nội dung an toàn. Xem [chmod(2)](https://man7.org/linux/man-pages/man2/chmod.2.html).

### 5.3. Setuid trên executable: danh tính có thể đổi khi chạy

**Executable (file thực thi)** là file được chạy như một chương trình. **Setuid** trên executable phù hợp có thể làm UID hiệu lực trở thành UID chủ file khi chạy, trong khi UID thực của người gọi vẫn khác. Setgid trên executable tương tự với GID. Đây là cơ chế cho một chương trình được kiểm soát thực hiện việc cần đặc quyền, không phải cấp vô điều kiện toàn quyền cho mọi thao tác của người dùng.

**Capability (đặc quyền riêng lẻ)** là cơ chế Linux chia đặc quyền quản trị thành các khả năng cụ thể, chẳng hạn vượt qua một số kiểm tra quyền file. Vì vậy câu “root làm được mọi thứ” là mô hình quá đơn giản: còn phải xét tập capability, chính sách bảo mật và môi trường.

Không tạo file setuid trong lab này. Bit có thể bị bỏ qua với filesystem gắn `nosuid`, tiến trình có `no_new_privs` hoặc tình huống theo dõi phù hợp; Linux không áp dụng setuid/setgid trên script theo cùng cách executable nhị phân. **`no_new_privs`** là thuộc tính tiến trình ngăn thu thêm đặc quyền khi thực thi chương trình. Các điều kiện cần đối chiếu ở [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html) và [capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html).

## 6. ACL: cấp quyền cụ thể nhưng phải đọc quyền hiệu lực

### 6.1. Khi ba lớp owner/group/other chưa đủ

**ACL (Access Control List, danh sách kiểm soát truy cập)** thêm các mục quyền cho user hoặc group cụ thể. Ví dụ file của root thuộc nhóm root, nhưng cấp riêng Alice quyền đọc/ghi mà không cho other. Bài dùng kiểu ACL thường được gọi POSIX ACL trên Linux; filesystem mạng có thể có mô hình ACL khác.

**Access ACL** điều khiển truy cập đối tượng hiện tại. **Default ACL** chỉ đặt trên thư mục, làm mẫu ACL cho đối tượng **mới tạo** bên trong. Chúng không phải cùng một danh sách: cấp default ACL không tự cấp quyền vào thư mục hiện tại, cũng không cập nhật file cũ.

`getfacl` xem ACL; `setfacl` thay ACL. Có công cụ chưa chứng minh filesystem hỗ trợ lưu ACL; lệnh thay có thể báo không hỗ trợ. Xem [acl(5)](https://man7.org/linux/man-pages/man5/acl.5.html).

### 6.2. Mask là “trần” cho những mục nào?

**ACL mask** giới hạn quyền hiệu lực của mục user được đặt tên, nhóm sở hữu và các nhóm được đặt tên. Nó không giới hạn mục owner hoặc other. Quyền hiệu lực là phần vừa được mục ACL cấp vừa được mask cho phép.

```text
user:labalice:rw-    quyền khai báo đọc + ghi
mask::r--           trần chỉ cho đọc
           |
           v
quyền hiệu lực: r--  Alice không ghi được qua mục này
```

Đọc từ hai dòng xuống: bit w bị mask loại dù mục user có w. `getfacl` thường thêm chú thích `#effective:r--` để chỉ điều đó. Với ACL mở rộng có mask, ba bit group trong `ls -l` thể hiện **mask**, không luôn là quyền riêng của nhóm sở hữu. Vì vậy phải xem ACL để giải thích dấu `+` và quyền thật.

Owner vẫn được xét trước named user; một mục tên owner không thay thế quyền owner. Nếu không khớp owner nhưng có mục user cụ thể, không được bỏ qua mục đó để lấy other rộng hơn. Các mục nhóm được kiểm tra theo thuật toán ACL, không trộn owner, named user và other tùy ý. Mask cũng khác umask: mask là trần của ACL đối tượng; umask là mặt nạ khi tạo trong trường hợp không có default ACL.

### 6.3. `chmod` và ACL có ảnh hưởng nhau không?

Có. Khi có mask, đổi bit group bằng `chmod` có thể đổi mask và ảnh hưởng quyền hiệu lực của nhiều mục, dù dòng user cụ thể vẫn ghi `rw-`. `setfacl` thường tính lại mask từ các mục được cấp, trừ khi có tùy chọn hoặc mask chỉ định rõ. Vì vậy sau bất kỳ thay đổi nào, xem lại `getfacl` và thử truy cập bằng đúng danh tính.

Default ACL cũng không tự thêm x cho file text mà ứng dụng không yêu cầu. ACL kế thừa được giới hạn theo mode yêu cầu lúc tạo; nếu ứng dụng yêu cầu 0600, không mặc định default ACL sẽ làm người khác đọc được. Xem [setfacl(1)](https://man7.org/linux/man-pages/man1/setfacl.1.html) và [getfacl(1)](https://man7.org/linux/man-pages/man1/getfacl.1.html).

## 7. Lab: kiểm chứng quyền rồi tạo thư mục cộng tác

### 7.1. Thử quyền cơ bản bằng file của chính bạn

Dùng Bash với user thường, không chạy bằng root vì đặc quyền có thể làm mất ý nghĩa thử từ chối. Không bật `set -e`; lab cố ý chạy lệnh lỗi. Tạo thư mục mới, kiểm tra tạo và chuyển vào thành công trước khi tiếp tục:

```bash
id
mkdir -p "$HOME/linux-lab/permissions"
permission_lab=$(mktemp -d "$HOME/linux-lab/permissions/run.XXXXXX")
cd "$permission_lab"
pwd
printf 'hello\n' > owner-test.txt
chmod 0040 owner-test.txt
cat owner-test.txt
result=$?
printf 'owner_read_status=%s\n' "$result"
chmod 0600 owner-test.txt
cat owner-test.txt
```

`mktemp -d` tạo thư mục riêng, `permission_lab` lưu đường dẫn; `pwd` phải nằm dưới `linux-lab/permissions/run.…`. Với owner không đặc quyền và không có ACL mở rộng, lần đọc đầu thất bại dù group được r; sau khôi phục 0600 đọc được `hello`. `$?` là trạng thái lệnh vừa chạy, khác 0 biểu thị thất bại của `cat`; lưu ngay, đừng lấy status của lệnh `printf` sau đó.

Thử biết tên mà không được liệt kê:

```bash
mkdir known-name
printf 'read by known name\n' > known-name/note.txt
chmod 0600 known-name/note.txt
chmod 0100 known-name
cat known-name/note.txt
ls -1 known-name
result=$?
printf 'list_status=%s\n' "$result"
chmod 0700 known-name
ls -1 known-name
```

Owner có x trên thư mục và r trên file nên `cat` thành công; thiếu r thư mục nên `ls -1` thất bại. Khôi phục 0700 rồi liệt kê thấy `note.txt`. Trên môi trường có chính sách bổ sung, kết quả khác cần được giải thích bằng kiểm tra danh tính, ACL và chính sách thay vì kết luận bảng quyền sai.

Thử xóa file không có w:

```bash
mkdir delete-demo
printf 'temporary\n' > delete-demo/readonly.txt
chmod 0400 delete-demo/readonly.txt
rm -f -- delete-demo/readonly.txt
if test -e delete-demo/readonly.txt; then
    printf 'Ten van ton tai\n'
else
    printf 'Ten da duoc xoa\n'
fi
```

`--` kết thúc tùy chọn; `-f` bỏ câu hỏi tương tác trên đúng file thử vừa tạo. Thư mục thuộc bạn còn w+x nên gỡ tên được dù file chỉ đọc. `test -e` kiểm tra tên tồn tại; kết quả không chứng minh byte đã bị ghi đè an toàn trên thiết bị.

Cuối cùng kiểm tra umask trong thư mục lab không có default ACL:

```bash
(
    umask 0022
    printf 'first\n' > mask-22.txt
    mkdir mask-22-dir
    umask 0077
    printf 'second\n' > mask-77.txt
    mkdir mask-77-dir
    umask 0000
    printf 'no execute\n' > mask-zero.txt
    stat -c '%a %n' mask-22.txt mask-22-dir mask-77.txt mask-77-dir mask-zero.txt
)
```

**Minh họa:** lần lượt 644, 755, 600, 700, 666. Nếu khác, xem `getfacl .` khi công cụ có sẵn, kiểm tra file có thực sự mới và ứng dụng tạo có hành vi khác hay không.

### 7.2. Chuẩn bị lab quản trị: tên nào được phép tạo?

Các bước sau **thay đổi VM thực hành**: thêm hai tài khoản, một nhóm và một thư mục dưới `/srv`. `/srv` thường dành cho dữ liệu phục vụ dịch vụ; ở đây dùng một thư mục riêng để các tài khoản lab không bị chặn bởi quyền thư mục cá nhân của bạn.

Hai tài khoản: Alice là thành viên đội, Bob là người ngoài để thử ACL/sticky. Chỉ tạo khi tên và đường dẫn chưa tồn tại:

```bash
command -v sudo getent groupadd useradd usermod install namei
sudo -v
getent passwd labalice
getent passwd labbob
getent group labteam
getent group labalice
getent group labbob
sudo test -e /srv/linux-team-lab
sudo test -L /srv/linux-team-lab
```

`sudo -v` kiểm tra/gia hạn quyền sudo theo chính sách, có thể yêu cầu mật khẩu hiện tại. `getent` với tên chưa có thường không in gì và trả 2; chỉ tiếp tục khi xác nhận đây là **không tìm thấy**, không phải công cụ/nguồn danh tính đang hỏng. Kiểm tra cả nhóm cùng tên vì lab dùng nhóm riêng của từng tài khoản. `test -L` kiểm tra liên kết tượng trưng để tránh bỏ sót một liên kết đích không tồn tại.

Nếu có tên hoặc thư mục trùng, chọn tên lab khác và thay nhất quán trong **mọi lệnh**, kể cả phần khôi phục và dọn dẹp. Không đổi quyền, chiếm nhóm hay xóa một đối tượng có sẵn để “làm giống ví dụ”. Nếu bạn không được phép dùng sudo, phần 7.1 vẫn thực hành được; phần quản trị cần VM/tài khoản quản trị đúng điều kiện.

### 7.3. Tạo tài khoản và thư mục đội

```bash
sudo groupadd labteam
sudo useradd -m -U -s /bin/bash labalice
sudo useradd -m -U -s /bin/bash labbob
sudo usermod -aG labteam labalice
sudo install -d -o root -g labteam -m 2770 /srv/linux-team-lab
sudo -u labalice id
sudo -u labbob id
ls -ld /srv/linux-team-lab
```

Chỉ tiếp tục khi từng lệnh tạo thành công:

- `groupadd` tạo nhóm mới.
- `useradd -m` tạo thư mục cá nhân; `-U` tạo nhóm riêng cùng tên; `-s /bin/bash` đặt shell. Lab không đặt mật khẩu và không yêu cầu đăng nhập trực tiếp các tài khoản này; mặc định mật khẩu thường bị khóa khi không cung cấp mật khẩu, tùy cấu hình công cụ/distro.
- `usermod -aG` thêm nhóm bổ sung: `-G` chọn danh sách, `-a` giữ các nhóm cũ. Bỏ `-a` có thể thay toàn bộ danh sách nhóm bổ sung.
- `install -d` tạo thư mục; `-o`, `-g`, `-m` đặt owner, group, mode. Công cụ này có thể sửa thuộc tính thư mục đã tồn tại, nên bước kiểm tra trùng là điều kiện quan trọng.

**Minh họa:** Alice có nhóm `labteam`, Bob không có; thư mục là `drwxrws--- root labteam`. Số UID/GID sẽ do máy chọn. Không tự thêm tài khoản làm việc của bạn vào nhóm; dùng `sudo -u` để tách rõ danh tính thử.

### 7.4. Tạo file: setgid giữ nhóm, umask quyết định bit còn lại

```bash
sudo -u labalice sh -c 'umask 0002; printf "hello\n" > /srv/linux-team-lab/note.txt'
ls -l /srv/linux-team-lab/note.txt
stat -c '%a %U:%G %n' /srv/linux-team-lab/note.txt
sudo -u labalice cat /srv/linux-team-lab/note.txt
sudo -u labbob cat /srv/linux-team-lab/note.txt
result=$?
printf 'bob_read_status=%s\n' "$result"
namei -l /srv/linux-team-lab/note.txt
```

`sh -c` chạy chuỗi lệnh trong một shell mới dưới Alice; umask và dấu `>` đều được thực hiện trong danh tính ấy. Nếu viết `sudo -u labalice printf ... > file`, shell của **bạn** sẽ thực hiện redirect trước, làm phép thử sai danh tính.

**Minh họa:** `note.txt` có 664, owner `labalice`, group `labteam`. Alice đọc `hello`; Bob bị từ chối dù file có r cho other, vì thư mục 2770 không cho Bob đi qua. Đọc `namei` để xác định cửa chặn, không sửa file thành 666 rồi mong Bob vào được.

Setgid không tự cấp quyền group ghi; muốn kiểm chứng, tạo thêm file với `umask 0077` rồi xem group vẫn `labteam` nhưng mode thường 600. Khi cần tránh other có quyền ngay trên file, chọn 0007 thay vì 0002.

### 7.5. Cố ý chặn thư mục rồi khôi phục ngay

```bash
sudo chmod 2700 /srv/linux-team-lab
sudo -u labalice cat /srv/linux-team-lab/note.txt
blocked_status=$?
sudo chmod 2770 /srv/linux-team-lab
sudo -u labalice cat /srv/linux-team-lab/note.txt
restored_status=$?
printf 'blocked=%s restored=%s\n' "$blocked_status" "$restored_status"
ls -ld /srv/linux-team-lab
```

2700 giữ setgid nhưng bỏ rwx của group. Alice vẫn là owner file, nhưng không phải owner thư mục root; cô ấy bị chặn ở thư mục trước khi đọc file. **Minh họa:** blocked khác 0, restored là 0 và đọc lại `hello`.

Lệnh khôi phục là phần bắt buộc của bước thử, không bỏ qua vì lệnh đọc đã thất bại. Nếu bạn dừng giữa chừng, chạy `sudo chmod 2770 /srv/linux-team-lab` và xác nhận Alice đọc được trước khi chuyển bước. Không thay owner của file để giải quyết một lỗi ở thư mục cha.

### 7.6. Thử sticky bit bằng một thư mục riêng

Tạo nơi cả Alice và Bob đi vào được, rồi quan sát Bob thử xóa file Alice. Thư mục cha cần cho Bob đi qua; chỉ cấp x riêng bằng ACL nếu có, hoặc dùng thư mục thử tách dưới `/srv` như sau. Kiểm tra tên chưa có bằng `sudo test -e` và `sudo test -L` trước:

```bash
sudo install -d -o root -g root -m 1777 /srv/linux-sticky-lab
sudo -u labalice sh -c 'umask 0077; printf "alice data\n" > /srv/linux-sticky-lab/alice.txt'
sudo -u labbob rm -f -- /srv/linux-sticky-lab/alice.txt
result=$?
printf 'bob_delete_status=%s\n' "$result"
sudo -u labalice cat /srv/linux-sticky-lab/alice.txt
ls -ld /srv/linux-sticky-lab
```

1777 cho cả hai w+x nhưng sticky chặn Bob gỡ tên của Alice vì Bob cũng không sở hữu thư mục root. **Minh họa:** xóa trả khác 0, file vẫn có dữ liệu. Đây là thư mục thử dùng chung rộng trong VM; không lưu bí mật ngoài file nhỏ đã tạo. Alice có thể xóa file mình; root quản lý thư mục được. Không cần tắt sticky để hoàn thành phép thử.

### 7.7. ACL tùy chọn: quan sát mask và quyền hiệu lực

Nếu có `getfacl`, `setfacl` và filesystem hỗ trợ ACL, tạo thư mục con riêng. Alice có thể đọc file vì có x qua các thư mục; file mẫu thuộc root để Alice được xét bằng named user chứ không bằng owner:

```bash
command -v getfacl setfacl
sudo install -d -o root -g labteam -m 2770 /srv/linux-team-lab/acl-demo
sudo sh -c 'printf "acl data\n" > /srv/linux-team-lab/acl-demo/mask.txt'
sudo chmod 0600 /srv/linux-team-lab/acl-demo/mask.txt
sudo setfacl -m u:labalice:rw,m::r /srv/linux-team-lab/acl-demo/mask.txt
getfacl /srv/linux-team-lab/acl-demo/mask.txt
sudo -u labalice cat /srv/linux-team-lab/acl-demo/mask.txt
sudo -u labalice sh -c 'printf "extra\n" >> /srv/linux-team-lab/acl-demo/mask.txt'
result=$?
printf 'masked_write_status=%s\n' "$result"
sudo setfacl -m m::rw /srv/linux-team-lab/acl-demo/mask.txt
sudo -u labalice sh -c 'printf "extra\n" >> /srv/linux-team-lab/acl-demo/mask.txt'
getfacl /srv/linux-team-lab/acl-demo/mask.txt
```

`setfacl -m` sửa/thêm mục. `u:labalice:rw` cấp đọc/ghi cho Alice, `m::r` đặt mask chỉ đọc. **Minh họa:** `user:labalice:rw- #effective:r--`; đọc được nhưng append (ghi nối) bị từ chối. Nâng mask thành rw rồi ghi được. Không mở rộng other để sửa lỗi mask.

Nếu lệnh đặt ACL báo `Operation not supported`, không giả định nó đã thành công; bỏ qua phần ACL trên filesystem ấy và giữ lab cơ bản. `getfacl` có thể vẫn hiện quyền truyền thống dù filesystem không hỗ trợ ACL mở rộng. Thông báo `Removing leading '/'...` của `getfacl` với đường dẫn tuyệt đối thường là thông báo cách trình bày tên, không tự chứng minh truy cập lỗi.

### 7.8. Default ACL: file mới kế thừa, file cũ không tự đổi

Dùng một thư mục con mới, không đặt default ACL lên toàn `/srv`:

```bash
sudo install -d -o root -g labteam -m 2770 /srv/linux-team-lab/acl-inherit
sudo setfacl -m d:u::rwx,d:g::rwx,d:m::rwx,d:o::--- /srv/linux-team-lab/acl-inherit
getfacl /srv/linux-team-lab/acl-inherit
sudo -u labalice sh -c 'umask 0077; printf "inherited\n" > /srv/linux-team-lab/acl-inherit/shared.txt'
getfacl /srv/linux-team-lab/acl-inherit/shared.txt
stat -c '%a %U:%G %n' /srv/linux-team-lab/acl-inherit/shared.txt
```

`d:` chỉ mục default; `u::`, `g::`, `m::`, `o::` lần lượt là owner, nhóm sở hữu, mask, other. Default cho rwx nhưng shell tạo file text yêu cầu 0666, nên mode hiệu lực dự kiến 660, không có x. Dù shell đặt umask 0077, ở đây default ACL và mode yêu cầu quyết định quyền ban đầu theo cơ chế kế thừa, nên không suy ra 600 bằng công thức umask thông thường.

Tự đọc các mục của file: quyền group có thể khai báo rwx nhưng `effective` chỉ rw do mask trên file; `stat` cho group `labteam`. Các file đã có trước khi đặt default ACL không tự đổi. Chuyển một file cũ vào bằng đổi tên cũng không phải phép tạo mới để áp dụng cùng quy tắc.

Nếu muốn thử ứng dụng yêu cầu quyền hẹp, chạy `sudo -u labalice mktemp /srv/linux-team-lab/acl-inherit/private.XXXXXX` rồi xem ACL của **đúng đường dẫn nó trả về**: quyền hiệu lực không được mở rộng ngoài mode 0600 mà `mktemp` yêu cầu.

### 7.9. Kết thúc lab: kiểm tra trạng thái và quyết định giữ hay dọn

Trước khi kết thúc, xác nhận thư mục đội đã trở về 2770 và Alice đọc được ghi chú. Ghi lại `id` của hai tài khoản, `ls -ld`, `namei -l`, ACL nếu đã thử, và giải thích mỗi trường hợp bị từ chối. Không cần đặt mật khẩu cho tài khoản chỉ để nộp bài.

Có thể giữ lab cho bài 26, nhưng ghi lại các tài khoản/thư mục đã tạo. Nếu muốn dọn, chỉ xóa những đối tượng **do chính lab này tạo**, xác nhận tên và không còn dùng bởi công việc khác. Các lệnh dưới đây xóa dữ liệu lab và thư mục cá nhân hai tài khoản, không thể xem như chỉ đổi quyền:

```bash
sudo rm -r -- /srv/linux-team-lab /srv/linux-sticky-lab
sudo userdel -r labalice
sudo userdel -r labbob
getent group labteam
sudo groupdel labteam
```

Nếu bỏ qua thử sticky thì bỏ đường dẫn sticky khỏi lệnh xóa. `userdel -r` xóa tài khoản cùng home và dữ liệu thư liên quan theo công cụ; nó không quét xóa mọi file sở hữu bởi UID trên toàn máy. Tài khoản còn tiến trình có thể khiến xóa thất bại: kiểm tra và đóng phiên lab trước, không ép xóa một tài khoản đang dùng.

Nhóm riêng `labalice`/`labbob` có thể đã được `userdel` dọn tùy cấu hình; kiểm tra `getent group labalice`, `getent group labbob`. Chỉ `groupdel` nhóm còn lại nếu xác nhận là nhóm lab và không còn được dùng. Cuối cùng kiểm tra lại `getent passwd` cho hai tên và `sudo test -e` cho hai thư mục để xác nhận đã dọn. Nếu giữ lab, không chạy khối dọn này.

## 8. Gỡ lỗi `Permission denied` ở đúng tầng

### 8.1. Bắt đầu từ thao tác và danh tính thực tế

Hãy xác định đang **đọc nội dung**, **ghi nội dung**, **tạo tên**, **xóa tên** hay **thực thi**. Rồi dùng `id` trong đúng phiên hoặc `sudo -u user id` cho phép thử mới. `id user` chỉ tra cấu hình, không chứng minh tiến trình cũ đã nhận nhóm mới.

Với redirect, nhớ shell mở file: `sudo command > file` không tự nâng quyền shell đang mở `file`. Trong lab, đặt redirect trong `sudo -u ... sh -c '...'` để rõ bên thực hiện. Không ghép dữ liệu không tin cậy vào chuỗi shell có đặc quyền; các chuỗi trong bài là đường dẫn cố định của lab.

### 8.2. Kiểm tra đường dẫn, chủ sở hữu và ACL

```bash
namei -l /srv/linux-team-lab/note.txt
ls -ld /srv/linux-team-lab
ls -ln /srv/linux-team-lab/note.txt
getfacl /srv/linux-team-lab /srv/linux-team-lab/note.txt
```

Đọc từng thư mục cha, rồi file cuối; xem UID/GID số nếu tên tra cứu có vẻ sai. ACL cần xem cả mục lẫn mask; dấu `+` trong `ls` là gợi ý để kiểm tra, không phải lời giải hoàn chỉnh. Việc đổi `chmod` có thể ảnh hưởng ACL nên đo lại sau sửa.

Nếu file hiển thị bằng UID số sau khi xóa tài khoản, dữ liệu chưa tự đổi owner sang người khác. Tái sử dụng UID cho tài khoản mới có thể khiến file cũ được xem là thuộc danh tính mới; đây là lý do phải quản lý UID và dữ liệu còn sót, không chỉ tên tài khoản.

### 8.3. Bit quyền cho phép mà vẫn không ghi được

**Filesystem (hệ thống tệp)** là lớp tổ chức file/thư mục và vùng lưu, như ext4. **Mount (gắn hệ thống tệp)** đưa một filesystem vào cây thư mục tại **mount point (điểm gắn)**, ví dụ dữ liệu USB hiện dưới `/media/usb`. Mount có tùy chọn riêng, như `ro` (read-only, chỉ đọc), `noexec` (hạn chế thực thi qua cơ chế tương ứng) hoặc `nosuid` (không áp dụng nâng danh tính từ bit set-ID).

```bash
findmnt -T /srv/linux-team-lab -o TARGET,FSTYPE,OPTIONS
```

`findmnt -T` tìm mount chứa đường dẫn; `TARGET` là điểm gắn, `FSTYPE` là loại filesystem, `OPTIONS` là tùy chọn. Lệnh chỉ xem thông tin. `chmod 777` không biến mount `ro` thành ghi được; đừng tự remount filesystem chỉ để bỏ qua nguyên nhân chưa hiểu.

**DAC (Discretionary Access Control)** là lớp quyền theo owner/group/ACL mà chủ sở hữu được phép quản lý trong giới hạn hệ thống. **MAC (Mandatory Access Control)** là lớp chính sách bắt buộc bổ sung, thường gặp qua SELinux hoặc AppArmor. DAC cho phép chưa có nghĩa MAC cho phép. SELinux có thể kiểm tra nhãn của đối tượng và tiến trình; AppArmor có thể áp hồ sơ hạn chế cho chương trình. Bài 26 sẽ đi sâu cách đọc chẩn đoán; trong bài này không tắt chính sách để “sửa” lỗi. Có thể đối chiếu [Red Hat: SELinux](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/using_selinux/getting-started-with-selinux) và [Ubuntu: AppArmor](https://documentation.ubuntu.com/server/how-to/security/apparmor/).

Các cờ bảo vệ như **immutable** (không cho thay đổi theo các thao tác bị cờ này chặn) cũng có thể ảnh hưởng. `lsattr file` xem cờ trên filesystem hỗ trợ; ký tự `i` là gợi ý immutable. Không phải mọi filesystem đều hỗ trợ `lsattr`. Đầy dung lượng thường cho lỗi khác như `No space left on device`, không nên gộp mọi lỗi ghi thành lỗi chmod.

### 8.4. Vì sao `chmod -R 777` thường làm hỏng cách bảo vệ?

`-R` là **recursive (đệ quy)**: áp dụng xuống cả cây thư mục. 777 cấp cả đọc/ghi/x cho mọi lớp, có thể làm nội dung lộ ra, cho người khác thay file chương trình/cấu hình, và đặt x không cần thiết lên file text. Nó cũng không giải quyết ACL khác tầng, mount chỉ đọc hoặc MAC theo đúng nguyên nhân.

Chọn thay đổi nhỏ theo nhu cầu: cần nhóm viết thì cấp g+w cho đúng đối tượng hoặc thiết kế thư mục cộng tác; cần đọc file thì kiểm tra đường dẫn và r; cần tạo file thì kiểm tra w+x ở thư mục. Khi muốn thêm x chỉ cho thư mục hoặc file vốn executable, cú pháp `X` của chmod có ý nghĩa điều kiện, nhưng vẫn phải hiểu phạm vi trước khi dùng trên cây thật. Không chạy sửa đệ quy rộng trong lab này.

### 8.5. Các mặc định không đồng nhất giữa môi trường

- `useradd` và `adduser` có thể là các công cụ khác nhau; distro có mặc định khác cho nhóm riêng, home, shell và khóa mật khẩu. Lab dùng tùy chọn rõ, kiểm tra kết quả bằng `getent`/`id`.
- Shell cũ không tự nhận nhóm mới. Dịch vụ đang chạy cũng có danh tính giữ từ lúc khởi chạy; có thể cần khởi động lại đúng dịch vụ sau thay cấu hình, không chỉ sửa `/etc/group`.
- Trên FAT hoặc một số mount chia sẻ, quyền/owner có thể được mô phỏng từ tùy chọn mount thay vì lưu như ext4. `chmod` không nhất thiết có tác dụng như trên filesystem Linux cục bộ.
- Trong container, root có thể thiếu capability, UID có ánh xạ và tài khoản bên trong khác bên ngoài; thử nghiệm “root đọc được” không phải kết luận cho mọi môi trường.

## 9. Tự kiểm tra và tiêu chí đối chiếu

1. File thuộc Alice có mode 0040, Alice thuộc nhóm sở hữu. Trong mô hình cơ bản, Alice đọc được không? Có được lấy group r khi owner thiếu r không?
2. Thư mục cho Alice x nhưng không r, file bên trong cho r. Vì sao đọc tên đã biết được nhưng liệt kê tên thất bại?
3. File mode 0400 nằm trong thư mục Alice có w+x, không sticky và không cơ chế chặn khác. Alice xóa tên được không? Đang sửa đối tượng nào?
4. Mode yêu cầu 0666, umask 0001 và không default ACL cho quyền gì? Vì sao phép trừ số sai?
5. Thư mục root:labteam mode 2770, Alice tạo file với umask 0077. Nhóm và quyền file dự kiến là gì?
6. Thêm Alice vào `labteam`, `id labalice` có nhóm mới nhưng `id` trong phiên Alice cũ không có. Phải kiểm tra và làm gì tiếp?
7. `user:labalice:rw-`, `mask::r--` trên file root:root. Alice có ghi được qua mục này không? Sau `chmod g-w` cần xem lại gì?
8. Default ACL rwx của group có tự biến file yêu cầu 0666 thành executable không? Có đổi file cũ không?
9. Sticky bit có ngăn một người sửa nội dung file đang cấp w cho họ không?
10. Mode và ACL đều cho ghi nhưng mount chỉ đọc. Tăng mode lên 777 có giải quyết không?

**Tiêu chí tự đối chiếu:**

- Câu 1–2: owner đã khớp không rơi sang group; r thư mục là liệt kê, x là tìm/đi qua, r file là đọc nội dung.
- Câu 3: sửa mục tên trong thư mục, không cần ghi nội dung file; còn phải xét sticky và bảo vệ bổ sung.
- Câu 4: vẫn 0666 vì bit bị mask loại vốn chưa có; umask là thao tác bit.
- Câu 5: file mới thường `labalice:labteam`, mode 600; setgid giữ group không tự cấp g+w.
- Câu 6: tra cấu hình khác với nhóm tiến trình; đăng nhập phiên mới rồi xác nhận `id`.
- Câu 7: hiệu lực chỉ r, không w; xem lại mask và mọi mục ACL chịu mask sau chmod.
- Câu 8–9: default chỉ ảnh hưởng tạo mới và bị mode yêu cầu giới hạn; sticky bảo vệ gỡ/đổi tên, không thay quyền ghi nội dung.
- Câu 10: chẩn đoán mount/chính sách đúng tầng, không tăng quyền vô điều kiện.

Bài tập áp dụng: thiết kế thư mục mà đội tạo file chung, người ngoài không vào, file text mới không executable. Chỉ ra owner/group/mode thư mục, umask hoặc default ACL, và cách kiểm tra bằng hai danh tính. Nếu muốn mọi thành viên **không xóa file của nhau**, giải thích tác dụng và giới hạn của sticky; nếu muốn mọi thành viên **không sửa nội dung của nhau**, phải thiết kế quyền file khác, không chỉ thêm sticky.

## 10. Tóm tắt mô hình cần nhớ

Tài khoản và nhóm là cấu hình danh tính; tiến trình giữ các ID và nhóm dùng để kiểm tra thực tế. Để mở file qua đường dẫn, phải đi qua các thư mục cha rồi có quyền thao tác cần thiết trên đối tượng cuối. Quyền nội dung và quyền sửa tên là hai việc khác nhau.

`chmod` sửa mode hiện tại; `chown`/`chgrp` sửa sở hữu; umask hạn chế quyền lúc tạo; setgid thư mục giữ nhóm của đối tượng mới; default ACL đặt mẫu quyền kế thừa; mask giới hạn một số mục ACL; sticky hạn chế gỡ/đổi tên. Khi gặp lỗi, xác định đúng thao tác, đúng danh tính và đúng tầng rồi sửa nhỏ nhất cần thiết.

Bài 11 sẽ học package và thư viện: hiểu quyền giúp phân biệt “chương trình chưa cài”, “không tìm đúng đường dẫn” và “đã có nhưng không được truy cập/thực thi”.

## Tài liệu kiểm chứng và đọc tiếp

Các tài liệu dưới đây đã được đối chiếu khi biên soạn; kiểm tra tài liệu/phiên bản địa phương khi làm trên distro hoặc công cụ khác:

- [credentials(7)](https://man7.org/linux/man-pages/man7/credentials.7.html), [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html): ID tiến trình và kiểm tra khi đi qua đường dẫn.
- [getent(1)](https://man7.org/linux/man-pages/man1/getent.1.html), [useradd(8)](https://man7.org/linux/man-pages/man8/useradd.8.html), [usermod(8)](https://man7.org/linux/man-pages/man8/usermod.8.html): tra cứu và quản lý tài khoản/nhóm.
- [umask(2)](https://man7.org/linux/man-pages/man2/umask.2.html), [chmod(2)](https://man7.org/linux/man-pages/man2/chmod.2.html), [GNU Coreutils manual](https://www.gnu.org/software/coreutils/manual/): mode, quyền thư mục và các bit đặc biệt.
- [acl(5)](https://man7.org/linux/man-pages/man5/acl.5.html), [getfacl(1)](https://man7.org/linux/man-pages/man1/getfacl.1.html), [setfacl(1)](https://man7.org/linux/man-pages/man1/setfacl.1.html): thuật toán ACL, mask và kế thừa.
- [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html), [capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html): danh tính và đặc quyền khi chạy chương trình.

`man` mở trang hướng dẫn cài trên máy: thử `man id`, `man chmod`, `man umask`, `man 5 acl`, `man 7 credentials`. Số 5 chọn nhóm định dạng file, số 7 chọn nhóm khái niệm. `umask` còn là lệnh tích hợp trong Bash, nên `help umask` xem đúng cú pháp của shell đang dùng. Nếu không cài man, đọc trợ giúp của công cụ và tài liệu trực tuyến tương ứng.
