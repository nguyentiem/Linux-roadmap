# Bài 27 — Hardening và quản lý bản vá

[Mục lục](../README.md) · [← Bài 26](26-xac-thuc-va-mac.md) · [Bài 28 →](28-ansible.md)

## Mục tiêu: làm máy khó bị khai thác mà vẫn quản trị và phục hồi được

Giả sử bạn vận hành một máy nhận yêu cầu web rồi chuyển đến ứng dụng phía sau. Máy chỉ cần phục vụ đúng chức năng ấy, nhưng sau nhiều lần thử nghiệm có thêm tài khoản, chương trình và cổng nghe không còn ai nhớ mục đích. “Tắt hết cho an toàn” có thể làm mất cả đường quản trị hoặc bằng chứng điều tra. Bài này giúp bạn tìm thứ cần giữ, thứ cần giảm và cách kiểm chứng một thay đổi.

**Hardening — gia cố bảo mật** là giảm những khả năng bị lạm dụng của hệ thống theo mục đích vận hành. **Patch — bản vá** sửa lỗi trong phần mềm; bản vá bảo mật xử lý vấn đề có thể ảnh hưởng an toàn hệ thống. Hai việc bổ sung nhau: hạn chế người được truy cập không thay việc sửa phần mềm lỗi; cập nhật phần mềm cũng không tự xóa tài khoản thừa.

Sau bài này, bạn cần lập cấu hình chuẩn theo vai trò, phân biệt khóa nhận diện máy và khóa người dùng SSH, kiểm tra quyền sudo, xây kế hoạch bản vá có đường phục hồi và giữ bằng chứng kiểm chứng. Cần bài 25–26. Lab chính là đọc thông tin và thử file mẫu trong thư mục riêng; mọi thay đổi SSH, sudo, dịch vụ hoặc gói của hệ thật được trình bày thành quy trình để làm trên máy thử, không là lệnh phải chạy ngay.

## 1. Trước khi chỉnh cấu hình, máy này dùng để làm gì?

**Baseline — cấu hình chuẩn được chấp nhận** mô tả trạng thái cần có của một loại máy: phần mềm, tài khoản, mạng và quyền phù hợp. **Role — vai trò** là nhiệm vụ chính, như máy chuyển tiếp web hoặc máy cơ sở dữ liệu. **Proxy — máy/chương trình chuyển tiếp yêu cầu** nhận yêu cầu rồi gửi tới dịch vụ phía sau. **Database — hệ quản lý dữ liệu** lưu và truy vấn dữ liệu có tổ chức. Hai vai trò này thường cần cổng, dữ liệu và quyền khác nhau.

**Service — dịch vụ** là chức năng chạy để phục vụ người dùng/chương trình khác. Nó thường có **process — tiến trình**, một lần chương trình đang hoạt động. **Port — cổng mạng** là số để phân biệt điểm nhận của ứng dụng trên một địa chỉ; cổng 443 thường được dùng cho web mã hóa nhưng số cổng tự nó không chứng minh giao thức. **Listener — điểm đang lắng nghe** sẵn sàng nhận kết nối/gói tin. **User — tài khoản** cho biết chương trình hoặc con người hoạt động dưới danh tính nào.

**Attack surface — bề mặt có thể bị tấn công** gồm các điểm mà đầu vào không tin cậy có thể chạm đến: cổng mạng, giao diện quản trị, tệp ghi được, quyền chạy lệnh. Giảm thành phần không dùng làm bề mặt này nhỏ hơn, nhưng không thể kết luận một cổng đóng là máy đã an toàn.

Một bảng baseline minh họa cho proxy, không phải mặc định cần áp lên mọi máy:

| Thành phần | Trạng thái mong muốn | Vì sao giữ / giới hạn |
|---|---|---|
| Web công khai | Chỉ cổng phục vụ đã quy định | Cần người dùng truy cập; phải đo ứng dụng trả đúng |
| SSH quản trị | Chỉ đường mạng và nhóm người quản trị phù hợp | Giữ khả năng xử lý sự cố; xác thực vẫn cần đúng |
| Tài khoản ứng dụng | Quyền hẹp, không là quản trị viên | Giảm hậu quả khi ứng dụng lỗi |
| Nhật ký và đồng bộ thời gian | Có, với giới hạn lưu và người chịu trách nhiệm | Phục vụ điều tra; không tắt để tiết kiệm tùy ý |
| Phần mềm thử nghiệm | Gỡ/tắt nếu xác nhận không còn phụ thuộc | Không gỡ theo tên lạ mà chưa kiểm tra |

**Dependency — phụ thuộc** là thành phần A cần B để hoạt động, như ứng dụng cần đồng hồ đúng để kiểm tra chứng thư. Bỏ B có thể làm A hỏng dù B không trực tiếp phục vụ người dùng. **Version control — quản lý phiên bản thay đổi**, như Git, giữ lịch sử cấu hình để biết ai đổi gì và có thể lấy lại bản cũ; không tự kiểm tra cấu hình an toàn hay dịch vụ còn hoạt động.

## 2. SSH xác nhận máy hay xác nhận người?

**SSH — giao thức truy cập từ xa có mã hóa** giúp máy khách trao đổi với máy chủ, thường để chạy lệnh quản trị. **Client — máy/chương trình khởi tạo kết nối** và **server — máy/chương trình nhận kết nối** có nhiệm vụ khác nhau. **Authentication — xác thực danh tính** kiểm tra “đang nói chuyện với ai”; **authorization — cho phép thao tác** quyết định danh tính đó được làm gì.

**Key pair — cặp khóa** gồm khóa riêng cần giữ bí mật và khóa công khai có thể phân phối. **Host key — khóa của máy chủ** giúp client nhận diện đúng server. **User key — khóa người dùng** giúp server xác nhận người đăng nhập có khóa riêng tương ứng với khóa công khai được cho phép. Hai hướng xác thực không thay thế nhau.

```text
Client quản trị                                Server SSH
   |                                                |
   | ← Server chứng minh giữ khóa riêng host ────────|
   |   Client đối chiếu host key đã tin cậy          |
   |                                                |
   | ─ Người dùng chứng minh giữ khóa riêng user ──→ |
   |   Server đối chiếu khóa user được cho phép      |
   |                                                |
   +──── thiết lập phiên với quyền tài khoản ────────+
```

Đọc hai mũi tên theo hai chiều: nhận diện server trước, rồi xác thực user phù hợp. Hệ có thể dùng mật khẩu hoặc cơ chế khác theo cấu hình; sơ đồ chỉ minh họa kết nối dùng khóa. [Cách OpenSSH xử lý xác thực](https://man.openbsd.org/sshd).

**Fingerprint — dấu nhận diện rút gọn của khóa** được tính từ khóa công khai. Client thường lưu khóa server đã biết trong `known_hosts`. Khi kết nối lần đầu, cần đối chiếu fingerprint qua kênh đáng tin như console máy hoặc hệ quản lý tài sản; chấp nhận mọi fingerprint xuất hiện không xác minh đúng máy. **Console — đường điều khiển trực tiếp/dự phòng** không phụ thuộc vào SSH đang sửa.

Cảnh báo host key thay đổi có thể do cài lại máy hợp lệ, nhưng cũng có thể do nhầm địa chỉ hoặc giả mạo. Hãy đối chiếu nguyên nhân và fingerprint mới; không xóa toàn bộ `known_hosts` để hết cảnh báo. Khóa người dùng hoạt động cũng không chứng minh khóa máy chủ đúng.

## 3. Vì sao phiên SSH cũ sống mà bạn vẫn có thể bị khóa ngoài?

**Session — phiên làm việc** là kết nối đã xác thực đang hoạt động. Khi thay cấu hình, phiên cũ có thể tiếp tục theo trạng thái đã tạo, còn phiên mới chịu điều kiện mới. Bằng chứng cần có là một lần đăng nhập mới thành công theo đường quản trị dự định.

**sshd** là chương trình server của OpenSSH; `sshd_config` là file cấu hình. **Syntax — cú pháp** là quy tắc viết file; **effective configuration — cấu hình hiệu lực** là kết quả sau khi xét file, các phần nhập thêm và điều kiện. **Include — nhập cấu hình từ file khác** và **Match — khối có điều kiện theo kết nối** làm chỉ nhìn một dòng có thể chưa đủ. OpenSSH thường lấy giá trị đầu tìm được cho nhiều tùy chọn, nên không mặc định file mang số lớn hơn luôn ghi đè file trước. [sshd_config](https://man.openbsd.org/sshd_config).

Các lệnh đọc/kiểm tra dưới đây **không reload server**. Đường dẫn `sshd`, quyền đọc host key và tham số cần đối chiếu bản cài; chỉ dùng quyền quản trị trên máy mà bạn quản lý nếu cần:

```bash
sudo /usr/sbin/sshd -t
sudo /usr/sbin/sshd -T
# Ví dụ xét điều kiện một kết nối giả định; thay danh tính/địa chỉ phù hợp.
sudo /usr/sbin/sshd -T -C user=labadmin,host=client.example,addr=192.0.2.10
```

`-t` kiểm tra tính hợp lệ cấu hình và khóa, thường không in gì khi đạt; cần xem mã kết thúc. `-T` in cấu hình hiệu lực, không thực sự đăng nhập. `-C` đưa thuộc tính kết nối để xét các khối `Match`; địa chỉ `192.0.2.10` chỉ là địa chỉ minh họa. Nếu cấu hình xét địa chỉ cục bộ/cổng cục bộ, bổ sung tham số tương ứng theo manual. [Tùy chọn sshd](https://man.openbsd.org/sshd).

Nếu định tắt đăng nhập bằng mật khẩu, cần xác nhận khóa đăng nhập trong phiên mới, quyền quản trị cần thiết và cách cứu bằng console. `PasswordAuthentication no` riêng nó không có nghĩa mọi cơ chế nhập mật khẩu đều bị tắt: `KbdInteractiveAuthentication` và cấu hình xác thực liên quan có thể còn cho đường tương tác. Phải xét yêu cầu và cơ chế đang dùng, không chép một “cấu hình an toàn” chung rồi bỏ các yếu tố này.

Quy trình thay đổi trên **VM clone — bản sao máy ảo để thử**: sao lưu bản cấu hình, ghi cấu hình hiện tại, chỉnh một mục, kiểm tra cú pháp/hiệu lực, áp dụng theo cách distro yêu cầu rồi thử phiên mới. **Distro — bản phân phối** đóng gói kernel/công cụ/cấu hình; tên dịch vụ có thể là `ssh` hoặc `sshd`. **Reload — nạp lại cấu hình** khác **restart — dừng và khởi động lại**; cách hỗ trợ tùy chương trình và đơn vị dịch vụ. Giữ phiên cũ và console đến khi đường mới được kiểm chứng, nhưng đừng coi giữ phiên cũ là cách phục hồi duy nhất.

## 4. Sudo cho phép một lệnh có thật là quyền hẹp?

**Root — tài khoản quản trị cao nhất theo cơ chế quyền truyền thống** có thể thao tác nhiều tài nguyên hệ thống. **Sudo** cho chạy lệnh dưới danh tính khác theo quy tắc được đặt, thường là root. **Permission — quyền thao tác** cho biết được đọc, ghi, thực thi hoặc thực hiện hành động nào; việc chạy được `sudo` không tự nghĩa được làm mọi thứ.

**Sudoers — tập quy tắc sudo** xét danh tính, máy, danh tính đích, đường lệnh và tham số. **Argument — đối số** là dữ liệu đi sau lệnh, như tên file cho chương trình sửa văn bản. Cho phép một chương trình mà không xét khả năng và đối số có thể rộng hơn dự định.

Ví dụ minh họa: quyền chạy trình sửa văn bản bằng root có thể cho sửa nhiều file hoặc gọi lệnh con. **Interpreter — trình thông dịch** như Python có thể thực hiện mã tùy ý, nên cho `sudo python3` thường gần như cho thực thi tùy ý với quyền đích. Một tiện ích đọc log có chức năng mở shell cũng cần xem xét. Hạn chế theo tên chương trình không tự ngăn **shell escape — gọi trình nhận lệnh từ bên trong công cụ**.

**Shell — trình nhận lệnh**, như Bash, chạy lệnh bạn nhập. Khi xem quyền của chính mình:

```bash
sudo -l
```

Lệnh liệt kê quyền theo chính sách và có thể yêu cầu xác thực; không thay quy tắc. `ALL` phải đọc cùng các trường ở dòng; không chỉ nhìn một tên lệnh. Đối chiếu `man sudoers` của bản cài và [manual sudoers của dự án](https://www.sudo.ws/docs/man/sudoers.man/) hoặc [bản đóng gói Debian](https://manpages.debian.org/testing/sudo/sudoers.5.en.html).

**visudo** là công cụ chỉnh/kiểm tra sudoers có hỗ trợ tránh lưu cú pháp sai và xung đột sửa. Để kiểm tra file mẫu riêng:

```bash
visudo -c -f ./sudoers.sample
```

`-c` chỉ kiểm tra; `-f` chọn file. Đây không cài quy tắc vào `/etc/sudoers`. Cú pháp đúng chưa chứng minh quyền đủ hẹp: còn phải thử đúng hành vi được phép và bị từ chối trên clone. [Manual visudo](https://www.sudo.ws/docs/man/visudo.man/).

## 5. Lab 1: kiểm kê trạng thái mà không sửa hệ thống

Điều kiện: Linux thử nghiệm; một số lệnh dùng systemd, bộ quản lý dịch vụ phổ biến nhưng không có trên mọi hệ. **TCP/UDP** là hai cách vận chuyển dữ liệu mạng; TCP có kết nối, UDP gửi datagram. `ss` xem các điểm mạng; `getent` hỏi cơ sở dữ liệu tài khoản mà hệ cấu hình, không chỉ đọc `/etc/passwd`.

```bash
ss -lntup
systemctl list-unit-files --state=enabled
getent passwd
sudo -l
timedatectl status
```

Không có quyền phù hợp, `ss` có thể không hiện tên/PID của mọi chương trình; trên máy bạn quản lý, `sudo ss -lntup` giúp bổ sung thông tin. Không có systemd thì dùng công cụ của hệ quản lý dịch vụ tương ứng; lỗi kết nối bus trong container không chứng minh host không có dịch vụ.

Cách đọc:

- `ss`: `-l` chọn điểm lắng nghe, `-n` giữ địa chỉ/số cổng, `-t/-u` chọn TCP/UDP, `-p` yêu cầu thông tin chương trình. `127.0.0.1:8080` thường chỉ nhận IPv4 từ máy cục bộ; `0.0.0.0:8080` là mọi địa chỉ IPv4 cục bộ. Không suy khả năng truy cập từ Internet chỉ từ listener: còn định tuyến, firewall và NAT. **Firewall — bộ lọc mạng** quyết định lưu lượng được phép; **NAT — chuyển đổi địa chỉ mạng** có thể đổi điểm truy cập.
- `list-unit-files --state=enabled`: xem cấu hình tự kích hoạt, không là danh sách mọi dịch vụ đang chạy. **Unit — đơn vị systemd** mô tả đối tượng quản lý, như dịch vụ hoặc socket; `enabled` khác `active`. Muốn xem hiện trạng, dùng `systemctl list-units --type=service --state=running`.
- `getent passwd`: mỗi dòng gồm tài khoản, UID, GID, thông tin, thư mục và shell. **UID/GID** là số nhận diện user/group; shell `nologin` gợi ý không cho đăng nhập kiểu shell, không chứng minh tài khoản không dùng chạy dịch vụ. Không đăng công khai toàn bộ danh sách tài khoản của máy thật.
- `timedatectl`: đọc cả timezone và trạng thái đồng bộ. **NTP — giao thức đồng bộ thời gian** có thể đã được bật nhưng chưa đồng bộ thành công; xem dòng `System clock synchronized` và công cụ của trình đồng bộ thật đang dùng. [Tài liệu timedatectl](https://www.freedesktop.org/software/systemd/man/latest/timedatectl.html), [bản manual Debian](https://manpages.debian.org/testing/systemd/timedatectl.1.en.html).

Lập bảng listener với service, tài khoản, mục đích, mạng được phép, người chịu trách nhiệm và nguồn bằng chứng. Với mỗi mục “không cần”, hãy xác nhận phụ thuộc trước khi đề xuất tắt.

## 6. Lab 2: kiểm tra cú pháp và tập phục hồi bằng file mẫu

Điều kiện: Bash, Python 3, tùy chọn `visudo`. Lab chỉ ghi thư mục tạm. **Rollback — quay lại trạng thái trước thay đổi** cần biết phiên bản nào là tốt và dữ liệu nào đã bị đổi. Đoạn dưới tạo baseline giả, làm thay đổi rồi khôi phục; không là cấu hình thật:

```bash
lab_dir=$(mktemp -d)
printf 'Lab directory: %s\n' "$lab_dir"
printf 'service=lab\nallow=management-only\n' > "$lab_dir/baseline.txt"
cp "$lab_dir/baseline.txt" "$lab_dir/baseline.before.txt"
printf 'service=lab\nallow=all\n' > "$lab_dir/baseline.txt"
diff -u "$lab_dir/baseline.before.txt" "$lab_dir/baseline.txt"
cp "$lab_dir/baseline.before.txt" "$lab_dir/baseline.txt"
cmp "$lab_dir/baseline.before.txt" "$lab_dir/baseline.txt"
printf 'labadmin ALL=(root) /usr/bin/true\n' > "$lab_dir/sudoers.sample"
chmod 0440 "$lab_dir/sudoers.sample"
visudo -c -f "$lab_dir/sudoers.sample"
```

`mktemp -d` tạo thư mục riêng; `cp` sao chép; `diff` in các dòng đổi và mã 1 khi có khác biệt, đây là kết quả dự định. Chạy bằng phiên Bash thông thường không bật chế độ dừng ngay khi mã khác 0. `cmp` không in gì và mã 0 khi hai file giống nhau. Dòng sudoers dùng tài khoản minh họa và `/usr/bin/true`, không cấp quyền thật vì chỉ nằm trong thư mục tạm. Không có `visudo` thì ghi bước cú pháp chưa kiểm tra; không thay bằng chép file vào `/etc`.

Tiêu chí: trước rollback thấy dòng `management-only` bị thay; sau rollback `cmp` thành công; file mẫu được parser chấp nhận nếu công cụ có mặt. Giới hạn: việc sao chép được file giả không chứng minh dịch vụ thật nạp lại thành công, phiên mới đăng nhập được hay dữ liệu phục hồi được.

Nhánh vận hành trên clone: chọn một dịch vụ thử không còn dùng, ghi trạng thái enabled/active trước, xác nhận phụ thuộc, tắt có kiểm soát, kiểm tra chức năng chính bằng một yêu cầu thực rồi phục hồi đúng trạng thái trước. Nếu dịch vụ do socket/timer kích hoạt, dừng service riêng có thể không đủ. **Health check — kiểm tra chức năng đang khỏe** cần xét phản hồi hợp lệ, không chỉ process tồn tại. Giữ timeline và bằng chứng trước/sau; không thực hiện bước này trên máy đang cần phục vụ.

## 7. Bản vá phải đi qua những bước nào?

**Package — gói phần mềm** chứa chương trình/cấu hình do distro quản lý. **Kernel — nhân hệ điều hành** là lõi quản lý CPU, bộ nhớ, thiết bị. **Advisory — thông báo bảo mật** của nhà cung cấp mô tả lỗi, phiên bản ảnh hưởng và bản sửa. **CVE** là mã nhận diện công khai của một vấn đề bảo mật; có mã không tự chứng minh máy bạn đang bị ảnh hưởng.

Quy trình nên biến một tin “có lỗi” thành câu trả lời có bằng chứng:

1. **Kiểm kê:** ghi distro/release, gói đã cài, nhân đang chạy và dịch vụ sử dụng chúng. **Release — phiên phát hành distro** ảnh hưởng gói/bản vá phù hợp. `cat /etc/os-release` nhận diện distro; `uname -r` xem nhân đang chạy; với Debian/Ubuntu có thể dùng `dpkg-query -W TEN_GOI`, các hệ khác dùng công cụ gói tương ứng.
2. **Đối chiếu advisory:** dùng đúng nhà cung cấp và release, xét cấu hình/đường sử dụng bị ảnh hưởng. [Ubuntu security notices](https://ubuntu.com/security/notices) là ví dụ nguồn chính thức; không áp phiên bản Ubuntu cho distro khác.
3. **Thử trên clone:** cùng cấu hình và tải đại diện; kiểm tra cập nhật không phá chức năng hay dữ liệu. **Workload — khối lượng/cách công việc chạy** gồm loại yêu cầu và mức tải, không chỉ chạy lệnh phiên bản.
4. **Chuẩn bị thay đổi:** backup, người chịu trách nhiệm, cửa sổ gián đoạn, đường quản trị dự phòng và tiêu chí quay lại. **Backup — bản sao phục hồi** phải thử đọc/khôi phục; có file backup chưa chứng minh phục hồi được.
5. **Áp dụng và kích hoạt bản mới:** cập nhật theo distro; restart dịch vụ hoặc reboot nếu cần. **Reboot — khởi động lại máy** thường cần để chuyển sang nhân mới nếu không có cơ chế khác phù hợp. Live patch có phạm vi riêng, không suy nó thay mọi cập nhật/reboot.
6. **Xác minh:** kiểm tra chức năng, log, phiên bản thật đang chạy và advisory đã được xử lý; cập nhật baseline/bằng chứng.

**Backport — đưa bản sửa từ nhánh mới về nhánh cũ** giúp distro duy trì phiên bản ổn định. Số upstream trông cũ có thể đã có bản sửa. **Upstream — dự án gốc** khác gói có bản vá của distro; đối chiếu package release và advisory thay vì chỉ so phần đầu số phiên bản. [Cơ chế cập nhật bảo mật Ubuntu](https://documentation.ubuntu.com/security/security-updates/).

Ví dụ minh họa: gói thư viện mới đã cài lên ổ đĩa nhưng tiến trình ứng dụng chưa khởi động lại vẫn có thể dùng bản cũ đã nạp. Tương tự, cài nhân mới không đổi kết quả `uname -r` ngay. Không có một lệnh phiên bản duy nhất chứng minh mọi luồng/dịch vụ dùng mã mới; cần xem quy trình của từng ứng dụng và công cụ distro.

Rollback gói không tự đảo **data migration — chuyển cấu trúc/nội dung dữ liệu** mà ứng dụng mới đã thực hiện. Nếu bản mới đổi dữ liệu không tương thích bản cũ, cần kế hoạch phục hồi dữ liệu hoặc nâng tiến để sửa; bài 30 đào sâu backup/recovery.

## 8. Secret, nhật ký và đồng hồ tham gia bảo mật thế nào?

**Secret — thông tin cần giữ bí mật** gồm khóa riêng, mật khẩu và **token — chuỗi chứng minh quyền truy cập**. Không đưa chúng vào Git hoặc đối số dòng lệnh có thể hiện qua danh sách tiến trình. Biến môi trường cũng không mặc định là kho bí mật an toàn; khả năng đọc phụ thuộc quyền và môi trường. Dùng cơ chế cấp/lưu secret phù hợp, quyền file hẹp, danh sách người truy cập và kế hoạch thay khi lộ.

**Rotation — thay secret có kiểm soát** gồm cấp giá trị mới, chuyển người dùng/dịch vụ sang nó, xác minh rồi thu hồi giá trị cũ. Xóa dòng secret khỏi commit mới không xóa lịch sử Git hoặc các bản sao đã bị lấy; secret đã lộ cần được thu hồi/thay.

**Audit — ghi và kiểm tra dấu vết thao tác** hỗ trợ trả lời ai làm gì, lúc nào. **Log — nhật ký sự kiện** giữ bằng chứng ứng dụng/hệ thống; cần giới hạn lưu, quyền đọc, tránh ghi secret và kế hoạch khi gần đầy. Tắt mọi log để tiết kiệm dung lượng làm mất khả năng dựng lại sự cố, không là hardening.

**Timestamp — mốc thời gian của sự kiện** chỉ hữu ích khi biết timezone và đồng hồ đáng tin. **TLS — giao thức bảo vệ kết nối bằng mã hóa và chứng thư** có kiểm tra thời hạn chứng thư, nên đồng hồ sai có thể làm xác minh hỏng hoặc khó diễn giải. NTP bật chưa chắc đồng bộ: ghi trạng thái thực tại lúc kiểm tra và đối chiếu daemon đang dùng.

## 9. Lỗi thường gặp và cách kiểm tra lại

| Nhầm lẫn | Điều cần đối chiếu |
|---|---|
| Có ít cổng nên an toàn | Còn tài khoản, quyền, cấu hình, mã lỗi và đường quản trị |
| Enabled nghĩa là đang chạy | Xem active và đường socket/timer có thể kích hoạt |
| Phiên SSH cũ còn nên cấu hình mới đúng | Thử một phiên mới theo điều kiện Match thật |
| `sshd -t` đạt nên đăng nhập chắc được | Cú pháp không kiểm tra mạng, khóa người dùng và quyền thực |
| Cho editor bằng sudo là quyền nhỏ | Xét đọc/ghi tùy ý, gọi lệnh con và đối số |
| Có gói mới nghĩa mọi process mới | Kiểm tra restart/reboot và ứng dụng đang nạp bản nào |
| Upstream version thấp nghĩa chưa vá | Đọc advisory/backport đúng distro/release |
| Có backup nghĩa rollback dữ liệu chắc được | Thử phục hồi và tương thích cấu trúc dữ liệu |

## 10. Tự kiểm tra và phần nộp

1. Proxy cần web công khai nhưng SSH chỉ cho mạng quản trị. Baseline cần ghi gì? **Đối chiếu:** chức năng, listener/mạng, user, quyền, chủ sở hữu và cách kiểm tra cả chức năng lẫn đường quản trị.
2. Đăng nhập bằng user key thành công có chứng minh đúng server không? **Đối chiếu:** không; host key phải được xác minh riêng.
3. Tắt PasswordAuthentication mà còn đường keyboard-interactive: có thể kết luận hết đăng nhập kiểu mật khẩu không? **Đối chiếu:** không; xét toàn bộ cơ chế hiệu lực.
4. Cài kernel mới nhưng chưa reboot: `uname -r` có bắt buộc đổi không? **Đối chiếu:** không; nó báo nhân đang chạy.
5. Sudoers có cú pháp đúng nhưng cho phép interpreter root. Có quyền hẹp không? **Đối chiếu:** thường không; parser chỉ kiểm tra cách viết.
6. Thay cấu hình rồi quay file cũ có đủ rollback không? **Đối chiếu:** cần áp dụng lại đúng cách, kiểm tra phiên/chức năng mới và dữ liệu nếu đã thay.

Nộp baseline một máy thử, bảng kiểm kê, kế hoạch một thay đổi nhỏ, bằng chứng file mẫu trước/sau rollback và phần kiểm chứng chưa làm. Với nhánh clone, bổ sung bằng chứng chức năng chính và đường quản trị sau khi đổi rồi sau phục hồi. Không trình bày đầu ra minh họa thành kết quả thật.

**Tự nhắc lại:** xác định vai trò → kiểm kê → giảm phần không cần → thử thay đổi → xác minh hành vi mới → giữ đường phục hồi. Bản vá cần đúng distro và trạng thái đang chạy. Bài 28 dùng Ansible để biểu diễn cấu hình chuẩn và sửa sai lệch có kiểm soát.

## Nguồn đối chiếu

- [OpenSSH sshd](https://man.openbsd.org/sshd), [sshd_config](https://man.openbsd.org/sshd_config): giao thức, kiểm tra và điều kiện cấu hình; đối chiếu manual bản Linux đã cài vì tính năng khác phiên bản.
- [Sudoers](https://www.sudo.ws/docs/man/sudoers.man/), [visudo](https://www.sudo.ws/docs/man/visudo.man/): quy tắc quyền và kiểm tra cú pháp.
- [Ubuntu security notices](https://ubuntu.com/security/notices), [security updates](https://documentation.ubuntu.com/security/security-updates/): ví dụ quy trình kiểm chứng theo distro.
- [systemctl](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html), [timedatectl](https://www.freedesktop.org/software/systemd/man/latest/timedatectl.html), [ss](https://man7.org/linux/man-pages/man8/ss.8.html): ý nghĩa trạng thái và công cụ kiểm kê.
