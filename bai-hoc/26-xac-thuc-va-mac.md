# Bài 26 — Xác thực, capabilities và kiểm soát truy cập bắt buộc

[Mục lục](../README.md) · [← Bài 25](25-service-firewall.md) · [Bài 27 →](27-hardening-va-ban-va.md)

## Mục tiêu: xác định lớp nào từ chối thay vì tắt cơ chế bảo vệ

Dịch vụ HTTP đã mở socket, curl kết nối được nhưng không đọc được file trang web. Tài khoản có tên trong hệ thống chưa đủ chứng minh process dùng danh tính đó; đăng nhập thành công chưa đủ chứng minh được đọc file; quyền `r` trong `ls -l` cũng chưa vượt mọi chính sách khác.

Bài này tách tra cứu danh tính, xác thực, quyền file, đặc quyền nhỏ và chính sách bắt buộc. Bạn cần tự dựng cây kiểm tra để biết bằng chứng nào thuộc lớp nào, dùng quyền tối thiểu và kiểm chứng sau phục hồi. Nên đã học bài 10, 15 và 25; thuật ngữ vẫn được nhắc lại tại chỗ.

Lab chính chỉ dùng tài khoản hiện tại và file tạm của chính bạn, không tạo user, không cấp capability, không đổi service hay chính sách MAC trên host. Các lệnh xem service bài 15 là tùy chọn nếu service đó thực sự có trong VM lab. Phần sửa nhãn/chính sách chỉ giải thích cơ chế, không yêu cầu chạy trên máy làm việc.

## 1. “Tài khoản này là ai?” khác “đã chứng minh danh tính chưa?”

**User — tài khoản** là danh tính hệ thống dùng quản lý quyền, ví dụ tài khoản chạy một dịch vụ. **UID — mã số tài khoản** là số kernel dùng nhận diện; tên chỉ là cách trình bày/tra cứu. **Group — nhóm tài khoản** gom danh tính để chia quyền; **GID — mã số nhóm** nhận diện nhóm. Hai tên trên hai máy không bảo đảm cùng UID/GID.

**Process — tiến trình** là một lần chương trình đang chạy; **PID** là mã số của nó. **Kernel — nhân hệ điều hành** quản lý tài nguyên và kiểm tra truy cập. Process mang các **credentials — thông tin danh tính/quyền đang dùng**, gồm UID/GID cùng nhóm bổ sung và thông tin khác. **Executable/binary — file chương trình thực thi** chứa mã mà hệ thống có thể nạp chạy, ví dụ `/usr/bin/python3`; chủ file là tài khoản sở hữu file ấy. Không suy từ chủ file executable ra danh tính mọi process chạy file đó. `id` cho biết danh tính trong ngữ cảnh gọi lệnh; `id TEN_USER` tra thông tin của tài khoản có tên, không đổi danh tính shell.

**NSS — Name Service Switch, cơ chế chọn nguồn tra cứu** cho biết tìm tên user/group và cơ sở dữ liệu khác ở đâu. Trên nhiều hệ dùng glibc — thư viện C cung cấp API hệ thống cho ứng dụng — `/etc/nsswitch.conf` có mục `passwd`, `group`, `hosts`. **API — giao diện lập trình** là tập hàm/quy tắc chương trình gọi; cơ chế NSS phục vụ các API tra cứu tương ứng. Nguồn `files` thường đọc file cục bộ; nguồn khác có thể tra dịch vụ danh tính qua mạng. Không mặc định mọi libc/embedded Linux hỗ trợ đúng hệ NSS mở rộng này. Xem [nsswitch.conf(5)](https://man7.org/linux/man-pages/man5/nsswitch.conf.5.html).

Ví dụ minh họa:

```text
getent passwd linuxlab
linuxlab:x:990:990:Lab HTTP:/nonexistent:/usr/sbin/nologin
```

**`getent`** hỏi cơ chế tra cứu cấu hình, không chỉ đọc mỗi `/etc/passwd`. Đọc các trường ngăn bằng `:`: tên, trường mật khẩu quy ước, UID, GID chính, mô tả, thư mục home, shell. `x` không là mật khẩu, không chứng minh tài khoản có mật khẩu dùng được. **Home — thư mục riêng** chứa dữ liệu tài khoản; **shell — trình diễn giải lệnh** được dùng khi môi trường đăng nhập cho phép. `/usr/sbin/nologin` thường từ chối phiên shell thông thường, nhưng tài khoản vẫn có thể dùng chạy service theo manager. UID 990 và dòng trên chỉ minh họa. Xem [getent(1)](https://man7.org/linux/man-pages/man1/getent.1.html).

## 2. PAM làm gì, và tại sao có user chưa đồng nghĩa đăng nhập được?

**Authentication — xác thực** kiểm tra bên yêu cầu có chứng minh danh tính theo cơ chế được chấp nhận không, như mật khẩu hoặc khóa. **Authorization — cấp/kiểm tra quyền** quyết định danh tính ấy được làm thao tác nào. Đây là hai câu hỏi khác nhau; đọc file còn phải qua kiểm tra quyền tài nguyên.

**PAM — bộ khung mô-đun xác thực có thể ghép** giúp ứng dụng tích hợp các bước kiểm tra theo cấu hình từng dịch vụ, thường ở `/etc/pam.d/`. **Module — thành phần chức năng dùng lại** như kiểm tra mật khẩu hoặc điều kiện tài khoản. Không phải mọi chương trình đều dùng PAM: phải có tích hợp và cấu hình tương ứng; service HTTP chỉ đọc file không tự cần đăng nhập PAM cho mỗi request.

| Nhóm PAM | Câu hỏi/trách nhiệm | Ví dụ điều cần kiểm tra |
|---|---|---|
| `auth` | Kiểm tra chứng minh danh tính và thiết lập credentials liên quan | Mật khẩu/chính sách phương thức xác thực |
| `account` | Tài khoản có được sử dụng trong điều kiện hiện tại? | Hết hạn hoặc giới hạn được cấu hình |
| `password` | Thay đổi thông tin xác thực | Đổi mật khẩu theo quy tắc |
| `session` | Chuẩn bị/dọn phiên sử dụng | Ghi nhận phiên hoặc thiết lập môi trường cần thiết |

Bảng là phân chia trách nhiệm, không phải cam kết mỗi ứng dụng gọi cả bốn nhóm ở mọi lần chạy. Thứ tự module và **control flag — cờ điều khiển cách gộp kết quả** như `required`, `requisite`, `sufficient` ảnh hưởng kết luận cuối; một module báo thành công chưa chắc cả chuỗi được chấp nhận. Không đổi PAM trên host để thử, vì có thể làm mất đăng nhập. Xem [PAM(8)](https://man7.org/linux/man-pages/man8/pam.8.html).

```text
Yêu cầu đăng nhập / chạy chương trình
   |
   +-> tra danh tính (NSS nếu ứng dụng dùng)
   +-> xác thực và điều kiện tài khoản (PAM nếu tích hợp)
   +-> process chạy với credentials đã chọn
         |
         +-> khi mở/ghi tài nguyên: kiểm tra quyền và chính sách liên quan
```

Đọc từ trên xuống: tra được tên không bỏ qua xác thực; xác thực thành công không bỏ qua quyền file. Các nhánh “nếu dùng” quan trọng: SSH dùng khóa có cơ chế xác thực riêng và có thể phối hợp PAM cho các bước khác theo cấu hình; không đồng nhất mọi xác thực Linux với PAM.

## 3. DAC quyết định quyền file dựa vào những gì?

**Permission — quyền truy cập** là quy tắc ai được thao tác tài nguyên. **DAC — kiểm soát truy cập theo quyền chủ sở hữu** dùng danh tính và quyền file như UID/GID, **mode — nhóm bit quyền đọc/ghi/thực thi**, cùng ACL khi có. Chủ sở hữu có thể đổi nhiều quyền trên file của mình theo quy tắc hệ thống; kernel kiểm tra quyền process lúc thao tác. Xem [credentials(7)](https://man7.org/linux/man-pages/man7/credentials.7.html).

Với file thường, `r` cho đọc, `w` cho ghi, `x` cho yêu cầu thực thi. Với thư mục, `x` là quyền đi qua/tìm thành phần bên trong; `r` cho liệt kê tên; `w` liên quan thay đổi các mục tên khi kèm điều kiện cần. Để mở `/srv/linux-lab-web/index.html`, không chỉ cần quyền đọc file mà còn cần đi qua các thư mục trên đường dẫn. `namei -l DUONG_DAN` giúp tách từng thành phần; không dùng `chmod 777` để bỏ qua việc xác định điểm từ chối. Xem [path_resolution(7)](https://man7.org/linux/man-pages/man7/path_resolution.7.html).

Mode số như `0644` là viết theo hệ bát phân: chủ file có đọc/ghi, nhóm có đọc, người khác có đọc. `0600` chỉ chủ file có đọc/ghi; `0000` không cấp các quyền cơ bản đó cho cả ba lớp. **Root — tài khoản quản trị có UID 0**, thường có nhiều đặc quyền, sẽ được phân biệt kỹ với capability ở mục 5. Ví dụ file owner root, mode 0600: process của `linuxlab` không có quyền đọc theo mode thông thường. Nhưng cần kiểm tra owner và quyền bổ sung thật, không áp dụng suy luận này cho file owner `linuxlab` hoặc process có đặc quyền bỏ qua DAC.

**ACL — danh sách quyền truy cập** thêm mục cho user/group cụ thể. **ACL mask — trần quyền hiệu lực** giới hạn nhiều mục ACL; một mục ghi `rwx` có thể có quyền thực tế thấp hơn do mask. `getfacl FILE` cho owner/group, các mục và thông tin `effective` nếu bị giới hạn. Dấu `+` cuối chuỗi quyền ở `ls -l` thường gợi ý ACL mở rộng, không tự nói ai được phép. Xem [acl(5)](https://man7.org/linux/man-pages/man5/acl.5.html).

Không cộng quyền owner/group/other tùy ý để kết luận. Kernel chọn lớp/mục phù hợp theo thuật toán DAC/ACL; còn đặc quyền, trạng thái lưu trữ và MAC có thể ràng buộc thêm. Lab chủ file hiện tại sẽ loại bỏ phần sửa user/group và tập trung vào việc bỏ quyền đọc của một file tạm.

## 4. Có quyền file rồi vì sao vẫn có thể bị từ chối?

**Filesystem — hệ thống tệp** tổ chức thư mục, tên và dữ liệu, ví dụ ext4. **Mount — gắn hệ thống tệp vào cây thư mục** cho phép truy cập nội dung qua một **mount point — thư mục điểm gắn**, ví dụ gắn bộ dữ liệu ở `/data`. **Read-only — chỉ đọc** ở lớp mount/thiết bị có thể ngăn ghi dù mode file có `w`. Dùng `findmnt -T DUONG_DAN` để xem mount chứa đường dẫn, filesystem và options — tùy chọn — như `ro`/`rw`; kết quả thuộc môi trường mount đang quan sát. Xem [findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html).

**MAC — Mandatory Access Control, kiểm soát truy cập bắt buộc** bổ sung chính sách mà ứng dụng/chủ file không tự bỏ qua chỉ bằng đổi mode. MAC ở đây khác địa chỉ MAC của Ethernet ở bài 24. **Policy — chính sách** quy định loại thao tác nào được cho phép trong ngữ cảnh liên quan.

**SELinux** thường dựa vào **label — nhãn bảo mật** trên đối tượng và **domain/type — miền/kiểu của chủ thể/đối tượng**. **AppArmor** thường gắn **profile — tập quy tắc cho ứng dụng** với quyền theo đường dẫn và các loại thao tác khác. Hai hệ có mô hình riêng; không lấy nguyên cách sửa nhãn SELinux áp dụng cho AppArmor. **LSM — Linux Security Modules** là bộ khung kernel hỗ trợ các mô-đun/chính sách bảo mật; có thể có nhiều thành phần cùng hoạt động, không chỉ hai tên trên. Xem [tài liệu LSM](https://docs.kernel.org/admin-guide/LSM/index.html).

Ví dụ service có thể đọc theo UID/mode nhưng SELinux không cho domain của service đọc type file đó, hoặc AppArmor không cho profile mở đường dẫn mới. Đổi DAC rộng hơn không giải quyết đúng nguyên nhân. Ngược lại, MAC cho phép cũng không tự cấp quyền DAC còn thiếu. Xem [SELinux trên RHEL](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/getting-started-with-selinux_using-selinux), [AppArmor trên Ubuntu](https://documentation.ubuntu.com/server/how-to/security/apparmor/).

**Sandbox — môi trường ràng buộc chương trình** có thể bổ sung góc nhìn file hoặc giới hạn syscall. **Namespace — phạm vi tài nguyên riêng** có thể khiến đường dẫn trong service khác host; **seccomp — bộ lọc lời gọi hệ thống** có thể hạn chế syscall — yêu cầu ứng dụng gửi kernel — theo cấu hình. Vì vậy “mình mở được trong shell” chưa chứng minh process service mở được trong môi trường của nó. Bài 36 sẽ đi sâu hơn; ở đây chỉ cần không gộp tất cả thành lỗi mode. Xem [seccomp của kernel](https://docs.kernel.org/userspace-api/seccomp_filter.html).

## 5. Root và capabilities có phải một công tắc bật/tắt mọi quyền?

**Root** là tài khoản UID 0, thường có nhiều đặc quyền; Linux còn ràng buộc theo namespace, capability, MAC và các cơ chế khác. “Root làm được” chỉ thu hẹp giả thuyết, không chứng minh service phải chạy root.

**Capability — một đặc quyền được tách nhỏ** cho phép cấp một nhóm thao tác thay vì trao toàn bộ quyền root. Ví dụ `CAP_DAC_OVERRIDE` có thể bỏ qua nhiều kiểm tra DAC; `CAP_NET_BIND_SERVICE` liên quan bind cổng thuộc phạm vi đặc quyền trong môi trường mạng. Ngưỡng cổng có thể đổi theo cấu hình kernel/namespace, không viết quy tắc “mọi cổng dưới 1024 luôn cần root” cho mọi môi trường.

Một luồng có các tập capability khác nhau; **effective — đang hiệu lực** phục vụ kiểm tra hiện tại, **permitted — tập được phép đưa vào hiệu lực** không đồng nghĩa tất cả đang bật. Các tập **inheritable — có vai trò truyền khi exec**, **bounding — giới hạn một số đường nhận capability**, **ambient — cơ chế giữ quyền qua exec thông thường theo điều kiện** có quy tắc riêng. **Exec** thay chương trình trong process hiện tại. Không suy capability của file chính xác bằng capability process đang chạy; phải đọc trạng thái và quy tắc exec. Xem [capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html).

**File capability** gắn quyền lên executable có thể ảnh hưởng mọi người được phép chạy nó theo điều kiện liên quan. Vì vậy không dùng `setcap` trên Python, shell hoặc binary hệ thống như một phép thử thuận tiện. Bài chỉ đọc `getcap FILE` khi công cụ có và đọc các trường `Cap...` trong `/proc/PID/status`. **`/proc`** là cây thông tin kernel công bố, không phải kho file dữ liệu thường; các giá trị capability được hiển thị thành mặt nạ bit, cần công cụ giải mã/đối chiếu thay vì đọc như số quyền tuyến tính.

**`no_new_privs` — cờ không nhận đặc quyền mới qua exec** ngăn các cơ chế exec liên quan làm tăng quyền, như set-user-ID hoặc file capabilities; không xóa mọi quyền đang có. **Set-user-ID** là bit cho phép một executable chuyển UID hiệu lực theo chủ file khi điều kiện cho phép. Cờ này có tính kế thừa và không thể tự tắt sau khi đặt; nó không tự tạo sandbox đầy đủ. Xem [no_new_privs của kernel](https://docs.kernel.org/userspace-api/no_new_privs.html).

Trên systemd — bộ quản lý service — `NoNewPrivileges=yes` áp dụng cờ đó cho service theo cấu hình. Dòng cấu hình không nói service mất mọi capability hoặc mọi tài nguyên bị giới hạn. Bài chỉ đọc thuộc tính nếu service có thật; không sửa unit — file mô tả service — trên host. Nguồn: [tài liệu systemd.exec trong kho chính thức](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml).

## 6. Lab 1: tra danh tính và đối chiếu process hiện tại

Dùng terminal — cửa sổ giao tiếp văn bản — chạy Bash, một shell diễn giải lệnh. Không dùng `sudo` cho phần này:

```bash
id
getent passwd "$(id -u)"
getent group "$(id -g)"
cat /etc/nsswitch.conf
ps -p "$$" -o pid,uid,gid,args
grep -E '^(Uid|Gid|Groups|CapInh|CapPrm|CapEff|CapBnd|CapAmb|NoNewPrivs):' "/proc/$$/status"
```

`$(...)` thu đầu ra một lệnh để dùng làm đối số. `id -u`/`id -g` lấy UID/GID hiệu lực hiện tại; `$$` là PID Bash trong ngữ cảnh terminal thông thường của lab. `grep -E` chọn dòng phù hợp biểu thức; dấu `^` nghĩa bắt đầu dòng. Không đọc `/proc/self/status` bằng `cat` rồi mặc định đó là Bash: `self` của tiến trình đọc sẽ là process `cat` trong trường hợp đó.

Đọc `Uid`/`Gid` có nhiều số cho các loại danh tính: real — danh tính thực, effective — dùng cho nhiều kiểm tra quyền, saved — giá trị lưu phục vụ chuyển quyền theo quy tắc, filesystem — dùng cho kiểm tra truy cập file Linux. Lab thông thường các giá trị giống nhau, nhưng không mặc định mọi process đều vậy. `Groups` là nhóm bổ sung của **process đang chạy**; thay thành viên tài khoản trong cơ sở dữ liệu không tự cập nhật mọi process cũ. Xem [credentials(7)](https://man7.org/linux/man-pages/man7/credentials.7.html).

Có dòng NSS/user chỉ xác nhận tra được danh tính; lab này chưa thực hiện một phép xác thực mật khẩu hay SSH. Không in nội dung `/etc/shadow` hoặc bí mật để chứng minh điều đó. Nếu `getent` không có trên embedded libc khác, dùng tài liệu môi trường đó, không coi thiếu công cụ là thiếu mọi danh tính.

## 7. Lab 2: gây lỗi DAC trên file tạm rồi phục hồi

### 7.1. Điều kiện

Dùng tài khoản thường không có capability bỏ qua DAC, Python 3 và filesystem cho phép đổi mode. Nếu `id -u` là 0, hoặc môi trường có quyền bỏ qua DAC, không dùng thử nghiệm này để kỳ vọng bị từ chối; chuyển sang VM/tài khoản lab thường. Không sửa file dịch vụ, không đổi owner của file thật.

Chạy đoạn sau; nó tạo một thư mục/file tạm và tự dọn, kể cả khi có lỗi được Python xử lý:

```bash
python3 - <<'PY'
import os
import pathlib
import stat
import tempfile

if os.geteuid() == 0:
    raise SystemExit("Use an ordinary lab account, not root")

with tempfile.TemporaryDirectory(prefix="linux-dac-lab-") as folder:
    path = pathlib.Path(folder) / "index.html"
    path.write_text("permission lab\n", encoding="utf-8")
    os.chmod(path, 0o600)
    saved_mode = stat.S_IMODE(path.stat().st_mode)
    print("owner UID:", path.stat().st_uid, "current UID:", os.geteuid())
    print("initial mode:", oct(saved_mode), "read:", path.read_text().strip())
    try:
        os.chmod(path, 0o000)
        try:
            print("unexpected read:", path.read_text().strip())
        except PermissionError as error:
            print("denied as expected:", type(error).__name__)
    finally:
        os.chmod(path, saved_mode)
    print("restored mode:", oct(stat.S_IMODE(path.stat().st_mode)))
    print("restored read:", path.read_text().strip())
PY
```

**`0o600`** là cú pháp số bát phân Python tương ứng mode 0600. `stat.S_IMODE` lấy riêng bit mode từ thông tin file; `saved_mode` giữ giá trị để khôi phục chính xác. **Exception — ngoại lệ** là cơ chế Python báo một thao tác thất bại; `PermissionError` biểu thị lỗi quyền theo API. `finally` phục hồi mode; trình quản lý thư mục tạm dọn khi rời khối.

Kết quả **minh họa**: owner UID bằng UID hiện tại, đọc đầu tiên được, sau mode 0000 có `denied as expected: PermissionError`, phục hồi 0600 thì đọc lại `permission lab`. File 0600 owner hiện tại **không gây từ chối** chính owner; ta dùng 0000 để tạo lỗi trong một danh tính mà không phải tạo user khác. Nó khác tình huống file owner root mode 0600 được đọc bởi service user riêng.

Nếu vẫn đọc được ở mode 0000, kiểm tra capability/môi trường/DAC của filesystem; đây là kết quả khác để điều tra, không sửa thành “DAC không tồn tại”. Nếu đổi mode lỗi hoặc đọc ban đầu đã thất bại, tiền đề lab không thỏa, dừng đọc lỗi. Lab chứng minh một đường từ chối/khôi phục cụ thể, không chứng minh MAC/PAM/capability của mọi service.

### 7.2. Áp dụng suy luận cho service bài 15, chỉ quan sát

Nếu VM đã có `linuxlab`, `linux-lab-http` và file mẫu, đọc:

```bash
getent passwd linuxlab
id linuxlab
namei -l /srv/linux-lab-web/index.html
stat -c 'owner=%U uid=%u group=%G mode=%a' /srv/linux-lab-web/index.html
getfacl /srv/linux-lab-web/index.html
systemctl show linux-lab-http -p User -p Group -p MainPID -p NoNewPrivileges
```

`namei -l` cho từng thành phần đường dẫn; `stat` cho owner/mode thật; `getfacl` cho quyền bổ sung nếu có. `User`/`Group` của unit là cấu hình manager, còn `MainPID` giúp chọn process thật để xem `/proc/PID/status`; service chưa chạy có thể có MainPID 0. Không đọc `/proc/0/...` để giả lập process.

Trong **VM thử đã được phép quản trị**, `sudo -u linuxlab id` và `sudo -u linuxlab cat FILE` có thể kiểm tra dưới danh tính ấy. Nhưng shell đó chưa chắc có cùng namespace, MAC domain/profile và sandbox với service; đây là bước thu hẹp giả thuyết, không thay quan sát process thực.

Tình huống **minh họa, không yêu cầu sửa host**: xác nhận file owner root, quyền ban đầu 0644 và service chạy linuxlab; nếu file bị đổi thành 0600 thì service thường không đọc được theo DAC. Sau phục hồi đúng mode đã ghi nhận, service có thể đọc lại. Phải kiểm tra owner trước khi áp dụng ví dụ; 0600 owner linuxlab có kết luận khác. Không tắt SELinux/AppArmor để chữa thiếu quyền DAC.

Với Python `SimpleHTTPRequestHandler` của service lab, lỗi mở file có thể được trình bày thành HTTP **404**, không bắt buộc 403. Vì vậy đọc cả lỗi truy cập bằng danh tính liên quan và log/process, không suy nguyên nhân chỉ từ số HTTP. Bài 25 đã phân biệt kết nối tốt với kết quả ứng dụng; nguồn hành vi handler: [Python http.server](https://docs.python.org/3/library/http.server.html).

## 8. Lab 3: nhận diện MAC, không đổi chế độ/policy

### 8.1. Nhận diện LSM và giới hạn quan sát

```bash
cat /sys/kernel/security/lsm
```

Có thể cần quyền để đọc; chỉ dùng `sudo` khi môi trường cho phép. Nếu không có đường dẫn, chưa được kết luận “mọi bảo vệ tắt”: **securityfs — hệ thống file đặc biệt công bố thông tin bảo mật kernel** có thể chưa được mount/hiện trong namespace, hoặc kernel/cấu hình không cung cấp giao diện đó. Không mount/sửa hệ thống chỉ để lab bắt buộc có đầu ra.

Danh sách LSM đang đăng ký không chứng minh mọi process đều được một policy AppArmor/SELinux cưỡng chế như nhau. Cần công cụ/nhãn/profile và chế độ tương ứng. Có executable công cụ chưa chứng minh policy đang áp dụng.

### 8.2. Trên hệ thật sự dùng SELinux

**Enforcing — cưỡng chế** chặn theo policy; **permissive — ghi nhận nhưng không cưỡng chế các denial SELinux như enforcing** phục vụ chẩn đoán trong ngữ cảnh phù hợp; **disabled — không hoạt động** có cách quản lý khác tùy distro. Đây là thuật ngữ để đọc trạng thái, không yêu cầu chuyển mode.

Nếu công cụ có, dùng `getenforce`, `ls -Z FILE`, `ps -eZ`; `-Z` hiển thị nhãn/ngữ cảnh SELinux. **Audit log — bản ghi kiểm tra bảo mật** có thể chứa **denial — sự kiện bị từ chối**. Đối chiếu thời gian, process/domain, đường dẫn/đối tượng và thao tác bị chặn; một sự kiện cũ không chứng minh lỗi hiện tại cùng nguyên nhân.

Khi nghi file bị nhãn sai sau copy, `matchpathcon FILE` tra nhãn mặc định theo cấu hình đường dẫn; có thể dùng `matchpathcon -V FILE` kiểm tra nhãn hiện có so với mong đợi, tùy công cụ. Nó không chứng minh domain của service được đọc type đó. Xem [matchpathcon(8)](https://man7.org/linux/man-pages/man8/matchpathcon.8.html).

**`restorecon`** là công cụ đưa nhãn file về giá trị phù hợp cấu hình mặc định; `restorecon -n -v FILE` xem thay đổi dự định mà không sửa, nếu phiên bản hỗ trợ. Dùng nó khi đường dẫn đã có policy đúng; không coi nó là phép tự thêm quyền cho mọi đường dẫn tùy chỉnh. Bài không chạy thay đổi nhãn thật. Xem [restorecon(8)](https://man7.org/linux/man-pages/man8/restorecon.8.html).

**`semanage fcontext`** quản lý quy tắc nhãn theo đường dẫn bền vững; khác `chcon` chỉ thay nhãn hiện tại có thể bị relabel/restorecon ghi đè. Đường dẫn tùy chỉnh cần xác định type đúng theo tài liệu dịch vụ/distro rồi quản lý quy tắc và áp nhãn trong quy trình đã kiểm tra. Không chọn type tùy tiện hoặc tự sinh allow rule từ mọi denial. Xem [semanage-fcontext(8)](https://man7.org/linux/man-pages/man8/semanage-fcontext.8.html).

### 8.3. Trên hệ thật sự dùng AppArmor

Nếu có, `aa-status` cho trạng thái profile, có thể cần quyền quản trị. **Enforce mode** thực thi profile, còn **complain mode** chủ yếu ghi các vi phạm được phép theo chế độ đó; các quy tắc deny rõ ràng có chi tiết riêng nên không coi complain như “mọi thao tác đều được phép”. Đối chiếu profile gắn process thật và log kernel/journal đúng thời điểm. **Journal — kho log có cấu trúc** trên hệ systemd có thể đọc qua `journalctl`, không phải mọi distro đều dùng nó.

Đường dẫn hoặc quyền thao tác mới có thể cần điều chỉnh profile cụ thể theo tài liệu distro; không dùng `setenforce` để chữa AppArmor vì đó là công cụ SELinux. Bài chỉ nhận diện/đọc, không chuyển profile hoặc tắt bảo vệ toàn hệ thống. Nguồn: [AppArmor trên Ubuntu](https://documentation.ubuntu.com/server/how-to/security/apparmor/).

Thiếu audit/journal event không loại trừ policy: cấu hình ghi log, rate limit — giới hạn tốc độ ghi — quyền đọc và loại sự kiện có thể ảnh hưởng. Chỉ thêm luật sau khi hiểu thao tác ứng dụng cần và phạm vi chính sách; nguyên tắc là quyền tối thiểu, không gom mọi lỗi thành allow.

## 9. Cây chẩn đoán: tiến trình này có mở được tài nguyên không?

Sơ đồ là **thứ tự điều tra**, không tuyên bố mọi kiểm tra kernel diễn ra đúng thứ tự này hoặc chỉ có một lớp từ chối:

```text
Có đúng process và đường dẫn trong môi trường của nó?
    |
    +-> danh tính thật: UID/GID, nhóm, credentials; tra tên qua NSS
    |
    +-> nếu lỗi đăng nhập: phương thức xác thực/PAM/account của dịch vụ
    |
    +-> truy cập file: DAC + ACL + quyền đi qua thư mục
    |
    +-> lưu trữ: mount ro/rw, trạng thái filesystem, đối tượng đặc biệt
    |
    +-> MAC: mode, label/profile, domain và log đúng thời điểm
    |
    +-> ràng buộc service: namespace, sandbox, seccomp, quyền đang có
    |
    +-> sửa đúng nguyên nhân, thử lại chính thao tác và kiểm tra phục hồi
```

Mỗi nhánh bổ sung bằng chứng thay vì bỏ qua nhánh trước. Nếu đã thấy DAC từ chối rõ, sửa đúng quyền cần thiết rồi kiểm chứng; sau đó MAC vẫn có thể từ chối thêm. Lệnh `sudo -u` thành công có thể cho biết tài khoản đọc được ở môi trường shell, nhưng không chứng minh sandbox service giống shell. Root đọc được không tự chứng minh thiếu root là nguyên nhân phải giữ lâu dài.

## 10. Lỗi thường gặp và tự kiểm tra

| Suy luận dễ sai | Cách kiểm tra đúng hơn |
|---|---|
| `getent passwd` có user nên user đăng nhập được | NSS tra danh tính; xác thực/account/session thuộc đường ứng dụng khác |
| Đăng nhập được nên đọc được mọi file | Process vẫn cần quyền tài nguyên và policy phù hợp |
| `ls -l` có `r` nên mọi process đọc được | Chọn đúng lớp UID/GID, ACL/mask, đường dẫn và MAC/môi trường |
| Đổi file thành 0600 chắc chắn service lỗi | Kiểm tra owner và credentials/capabilities thật |
| Root đọc được nên chạy service root | Xác định đúng quyền cần và giới hạn, không mở rộng toàn bộ |
| `NoNewPrivileges=yes` nghĩa không còn đặc quyền | Nó hạn chế đường tăng quyền qua exec, không xóa quyền hiện có |
| Thiếu `/sys/kernel/security/lsm` nghĩa không có bảo vệ | Xác định kernel, securityfs/namespace và quyền quan sát |
| Không có denial log nên loại trừ MAC | Kiểm tra logging, thời gian, quyền và chế độ policy |

1. `getent` tra được `linuxlab`, shell là nologin. Nó có thể chạy service không? **Đối chiếu:** có thể, theo manager/cấu hình; tên/shell đăng nhập không đồng nhất process service.
2. File root:root mode 0600, service UID linuxlab, không có đặc quyền DAC. Cần tắt SELinux không? **Đối chiếu:** không; có lý do DAC rõ, sửa đúng quyền/chủ thể theo thiết kế rồi kiểm chứng.
3. File mode 0644 nhưng `/srv/private` thiếu `x` cho service. Đọc file có chắc được? **Đối chiếu:** không; đi qua mọi thành phần đường dẫn cũng cần quyền.
4. ACL user có `rwx`, mask có `r--`. Có quyền ghi không? **Đối chiếu:** phải xét mask/quyền hiệu lực của mục đó, không đọc riêng `rwx`.
5. `sudo -u linuxlab cat` được nhưng service không đọc được. Kiểm tra tiếp gì? **Đối chiếu:** process thật, nhóm, namespace/mount, MAC domain/profile và sandbox; hai môi trường có thể khác.
6. `getcap` trên binary rỗng thì process chắc chắn không có capability? **Đối chiếu:** không; quyền có thể đến từ đường khởi chạy/kế thừa, đọc process thật.
7. `restorecon -n` dự kiến đổi nhãn. Nó chứng minh đó là cách chữa mọi denial không? **Đối chiếu:** không; cần policy đường dẫn đúng, domain/type phù hợp và thao tác thật.
8. Lab owner hiện tại 0600 vẫn đọc được, 0000 bị từ chối rồi phục hồi được. Điều gì đã chứng minh? **Đối chiếu:** cơ chế DAC trong tiền đề lab, không phải mọi lớp xác thực/MAC hay một cấu hình service khác.

Giữ cây chẩn đoán và kết quả before/denied/restored của file tạm, ghi danh tính và mode thật. Nếu đọc MAC/service, ghi rõ nguồn dữ liệu và lớp nào chưa xác minh, không xem thiếu quyền quan sát là bằng chứng cho kết luận.

**Tự nhắc mô hình:** NSS tìm danh tính; xác thực/PAM tùy ứng dụng xác định cách cho sử dụng tài khoản; process mang credentials; DAC/ACL, lớp lưu trữ, capabilities, MAC và sandbox cùng ràng buộc thao tác. Sửa một lớp đúng nguyên nhân rồi thử lại toàn đường đi. Bài 27 nối quyền tối thiểu với quản lý bản vá và làm cứng hệ thống.

## Nguồn và phạm vi distro

Nguồn Linux man-pages, kernel, PAM và tài liệu distro được gắn cạnh nội dung. Dùng `man nsswitch.conf`, `man pam`, `man 7 capabilities`, `man 5 acl`, `man 8 restorecon` theo bản đã cài. Mô hình và công cụ SELinux/AppArmor, tên package, đường dẫn log và cấu hình systemd khác theo distro/build; không áp nguyên cách sửa giữa hai cơ chế. Lab không thử xác thực tài khoản thật, không cấp quyền mới, không tắt MAC hoặc thay policy host.
