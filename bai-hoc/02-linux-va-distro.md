# Bài 02 — Linux, GNU/Linux và bản phân phối

[Mục lục](../README.md) · [← Bài 01](01-nen-tang-may-tinh.md) · [Bài 03 →](03-kien-truc-linux.md)

## Mục tiêu và liên hệ

Sau bài 01, bạn đã biết vai trò hệ điều hành. Bài này phân biệt phần do kernel cung cấp với phần do bản phân phối lựa chọn, giúp dùng đúng hướng dẫn và package.

Sau khi học xong, bạn cần tự trả lời được: “Máy này chạy kernel nào, thuộc distro nào, dùng công cụ nào để cài phần mềm, và vì sao hai máy cùng gọi là Linux vẫn có lệnh quản trị khác nhau?” Hãy dùng chính VM lab làm ví dụ; các tên và số phiên bản trong bài chỉ minh họa, không phải kết quả đo trên máy của bạn.

Đường học của bài là: **một lệnh chạy trên máy → lệnh đó cần kernel ra sao → distro ghép các thành phần nào → phiên bản nào đang chạy → package đến từ đâu → nhận diện máy trước khi làm theo hướng dẫn**. Mỗi bước trả lời một câu hỏi nảy sinh từ bước trước.

## 1. Kernel không phải toàn bộ hệ thống

Linux là kernel: quản lý tiến trình, bộ nhớ, thiết bị, mạng và các giao diện hệ thống. Để có môi trường sử dụng được còn cần init, thư viện, shell và ứng dụng. GNU cung cấp nhiều công cụ phổ biến như Bash và coreutils, nhưng hệ Linux không bắt buộc dùng toàn bộ GNU; hệ nhúng có thể dùng BusyBox và musl.

### Bóc tách một hệ Linux đang chạy

```text
Ứng dụng của bạn: editor, server, cat, trình duyệt…
Shell và công cụ: Bash, coreutils, BusyBox…
Thư viện/runtime: glibc, musl, Python runtime…
Init và dịch vụ: systemd hoặc lựa chọn khác
──────────────── ranh giới system call ────────────────
Linux kernel: tiến trình, bộ nhớ, filesystem, mạng, driver…
Phần cứng hoặc phần cứng ảo
```

**Kernel** là phần có quyền điều khiển tài nguyên hệ thống. Khi ứng dụng cần đọc file, tạo tiến trình hay gửi gói mạng, nó thường đi qua thư viện và gọi giao diện kernel. **User space** là nơi ứng dụng, shell, thư viện và dịch vụ thông thường chạy. Ranh giới này giải thích vì sao một lệnh như `cat` không phải “một phần của kernel” dù nó cần kernel để đọc file.

**GNU** là dự án cung cấp nhiều thành phần user space quen thuộc, như Bash, coreutils và thư viện C GNU. Cụm “GNU/Linux” nhấn mạnh hệ thống dùng cả kernel Linux và nhiều công cụ GNU. Tuy nhiên, không thể suy từ chữ “Linux” rằng máy chắc chắn có Bash, coreutils hoặc glibc: một thiết bị nhúng có thể dùng BusyBox, `sh` và musl. Khi đọc hướng dẫn, cần kiểm tra **công cụ thực sự có trên máy** thay vì chỉ nhìn tên hệ điều hành.

### Câu hỏi thường gặp: `ls` có phải một phần của kernel?

Không. `ls` là chương trình ở user space. Trên một hệ Debian thông thường, nó do package GNU `coreutils` cung cấp; trên hệ nhúng, tên lệnh `ls` có thể gọi một **applet** của BusyBox. Hai lệnh cùng tên có thể có tập tùy chọn khác nhau. Khi `ls` cần liệt kê thư mục, nó dùng giao diện do kernel cung cấp, nhưng bản thân mã `ls` không chạy trong kernel.

```text
Bạn gõ ls
   ↓
Shell tìm và chạy chương trình ls
   ↓
ls gọi thư viện / system call để đọc thư mục
   ↓
Kernel kiểm tra quyền và làm việc với filesystem
   ↓
ls nhận danh sách, định dạng và in ra terminal
```

Sơ đồ này giúp phân vai: **shell** hiểu dòng lệnh, **`ls`** quyết định cách trình bày, còn **kernel** cung cấp quyền truy cập thư mục. Trên Debian/Ubuntu, có thể thử `command -v ls` rồi `dpkg -S "$(command -v ls)"` để tìm package sở hữu file. Nếu đường dẫn là symlink hoặc package database khác cách lưu, cần giải quyết đường dẫn thật trước khi kết luận.

BusyBox gom nhiều tiện ích nhỏ vào một chương trình. Tùy cách cài, các tên như `ls`, `cp`, `sh` có thể là liên kết đến binary BusyBox; BusyBox chọn chức năng theo tên được gọi. Vì vậy, một script dùng tùy chọn riêng của GNU `ls` có thể không chạy trên BusyBox `ls`. [GNU Coreutils](https://www.gnu.org/software/coreutils/), [BusyBox About](https://busybox.net/about.html) và [BusyBox FAQ](https://busybox.net/FAQ.html) mô tả các thành phần này.

Distribution là cách tích hợp các thành phần đó thành hệ thống có bộ cài, repository, chính sách cập nhật và cấu hình mặc định. Hai distro có thể cùng kernel upstream nhưng mang bản vá, cấu hình và công cụ quản trị khác nhau.

Hãy hình dung distro là một **sản phẩm tích hợp**: nhóm phát hành chọn phiên bản kernel, biên dịch package, quyết định thư viện và init mặc định, cung cấp repository, cập nhật bảo mật và tài liệu vận hành. Vì vậy, “cùng dùng kernel Linux” chỉ nói về một tầng của hệ thống. Cách cài package, tên service, vị trí file cấu hình và chu kỳ hỗ trợ vẫn có thể khác.

Ví dụ cùng mục tiêu cài một ứng dụng, một hướng dẫn có thể dùng `apt` cho họ Debian, hướng dẫn khác dùng `dnf` cho họ RPM. Không nên đổi tên lệnh một cách máy móc: tên package, phiên bản, dependency và đường dẫn cấu hình cũng cần được đối chiếu với distro đang dùng.

### Cùng kernel Linux, vì sao hai distro vẫn khác?

Một distro phải đưa ra nhiều quyết định: chọn nhánh kernel, bật/tắt tính năng khi build, áp dụng bản vá, chọn thư viện C và init, đóng gói phần mềm, cấu hình mặc định và lịch hỗ trợ. Ngay cả khi hai máy cùng hiện một số phiên bản kernel nền, **binary kernel** vẫn có thể khác vì cấu hình build và bản vá khác. Số từ `uname -r` là đầu mối nhận diện, không phải mã định danh đầy đủ cho mọi tính năng.

```text
Mã nguồn Linux upstream
      ├─ Distro A: cấu hình A + bản vá A → kernel A
      └─ Distro B: cấu hình B + bản vá B → kernel B

kernel + thư viện + init + shell + package + cấu hình + chính sách cập nhật
                              ↓
                       hệ thống distro
```

Ví dụ khi tìm hướng dẫn cài web server, `apt install nginx`, `dnf install nginx` và `pacman -S nginx` chỉ minh họa **công cụ quản lý package** của từng họ distro. Tên package và lệnh chính xác phải được đối chiếu với tài liệu của release đang dùng. Một hướng dẫn còn có thể giả định `systemd`, trong khi thiết bị nhúng dùng init khác. Vì thế trước khi làm theo lệnh trên mạng, hãy nhận diện máy của mình ở phần lab bên dưới.

## 2. Những lớp phiên bản cần phân biệt

| Lớp | Ví dụ nhận diện | Ý nghĩa |
|---|---|---|
| Distro | `/etc/os-release` | Họ hệ thống, tên và phiên bản bản phát hành |
| Kernel đang chạy | `uname -r` | Kernel thực sự được boot |
| Package | Công cụ package manager | Phiên bản phần mềm đã cài |
| Ứng dụng đang chạy | Lệnh version/API phù hợp | Có thể khác package mới cài nếu chưa restart |

### Đọc bốn lớp phiên bản qua một tình huống

Giả sử quản trị viên vừa cập nhật package kernel và một dịch vụ web. Lúc này có thể tồn tại **kernel mới đã cài trên đĩa**, **kernel cũ vẫn đang chạy** và **tiến trình dịch vụ cũ chưa được restart**. Do đó:

1. `/etc/os-release` cho biết danh tính bản phát hành user space. Nó không cho biết chính xác phiên bản của mọi package.
2. `uname -r` hỏi kernel **đang chạy ngay lúc đó**. Muốn biết kernel mới có được boot hay chưa, kiểm tra lại lệnh này sau khi khởi động lại theo quy trình của hệ thống.
3. Package manager cho biết các package và phiên bản đã cài. “Đã cài” không luôn có nghĩa mọi tiến trình đã nạp mã mới.
4. Phiên bản của ứng dụng đang chạy phải được xác nhận bằng cách phù hợp với ứng dụng: lệnh version, API, thông tin tiến trình hoặc trạng thái dịch vụ. Lệnh `app --version` có thể chạy một bản mới từ đĩa mà không phản ánh tiến trình cũ còn trong RAM.

`uname -m` cho biết kiến trúc máy mà kernel báo cho môi trường đang chạy, chẳng hạn `x86_64` hoặc `aarch64`; đây là câu hỏi khác với “distro nào?”. Trong VM, đó là kiến trúc guest. Trong container, user space có thể mang tên một distro nhưng thường dùng chung kernel với host; cần ghi rõ ngữ cảnh trước khi diễn giải.

Cập nhật package kernel thường không thay kernel đang chạy ngay; cần boot vào kernel mới. Distro có thể backport bản sửa vào phiên bản cũ, vì vậy số upstream thấp chưa đủ kết luận thiếu bản vá.

**Backport** nghĩa là nhà phát hành đưa một bản sửa cần thiết vào nhánh package đang hỗ trợ mà vẫn giữ số phiên bản nền gần cũ. Ví dụ, nhìn một số phiên bản upstream thấp hơn máy khác chưa đủ kết luận máy đó thiếu bản sửa bảo mật. Phải xem thông báo và changelog của chính distro/package. Tương tự, số phiên bản cao hơn tự nó không bảo đảm tương thích với ứng dụng hiện có.

### Ví dụ cụ thể: “đã nâng cấp” nghĩa là gì?

Giả sử đây là các giá trị **minh họa**, không phải số phiên bản của máy bạn:

| Thành phần | Trước cập nhật | Sau khi cài package, chưa khởi động lại/restart | Cách xác nhận |
|---|---|---|---|
| Distro user space | release A | release A | `/etc/os-release` |
| Package kernel trên đĩa | bản K1 | bản K2 | Package manager của distro |
| Kernel đang chạy | K1 | vẫn có thể là K1 | `uname -r` |
| Package ứng dụng trên đĩa | bản P1 | bản P2 | Package manager |
| Tiến trình ứng dụng đang chạy | P1 | vẫn có thể là P1 | API/trạng thái của ứng dụng hoặc kiểm tra tiến trình |

Sau khi khởi động lại, máy **có thể** boot K2 nếu cấu hình boot chọn nó. Sau khi restart dịch vụ, tiến trình mới **có thể** dùng P2; cần kiểm tra kết quả thực tế. Không dùng `nginx -v` hay một lệnh `--version` chạy mới để khẳng định tiến trình cũ trong RAM đã đổi phiên bản. Sự khác nhau giữa “file/package đã cài” và “mã đang chạy” là nguyên nhân của nhiều kết luận sai khi kiểm tra bản vá.

Backport cũng có hai ngữ cảnh dễ nhầm. **Backport bản sửa bảo mật** là lấy bản sửa đưa vào package cũ đang được duy trì; **repository backports** có thể cung cấp package mới hơn được build cho release ổn định cũ. Cùng một từ nhưng mục tiêu không hệt nhau. [Debian Security FAQ](https://www.debian.org/security/faq) giải thích cách họ backport bản sửa và cách kiểm tra qua advisory/changelog; [Debian Reference](https://www.debian.org/doc/manuals/debian-reference/ch02) mô tả các kho package.

## 3. Repository và vòng đời

Repository là nguồn metadata và package có cơ chế xác minh. Package manager giải quyết dependency và ghi nhận file thuộc package nào. Trộn repository giữa các release có thể khiến bộ thư viện không tương thích.

**Package** là đơn vị phần mềm do distro đóng gói, kèm metadata như phiên bản và các dependency. **Repository** là nguồn cung cấp package và metadata để package manager tìm, xác minh và cài đặt. **Dependency** là thành phần mà một package cần để hoạt động. Quy trình thường là: package manager cập nhật danh sách từ repository → chọn phiên bản phù hợp → giải quyết dependency → tải và xác minh package → cài các file và ghi nhận trạng thái.

### Theo dấu một lần cài phần mềm

Ví dụ giả định bạn muốn cài `nginx` trên Debian/Ubuntu. `apt` là công cụ cấp cao đọc danh sách repository và giải dependency; `dpkg` quản lý package `.deb` đã cài ở tầng thấp hơn. Bạn yêu cầu một package, nhưng nó có thể cần thêm thư viện và các package phụ trợ. Package manager dùng metadata để chọn **bộ phiên bản tương thích**, tải package, kiểm tra tính toàn vẹn/xác thực theo cơ chế repository rồi cài vào hệ thống.

```text
Yêu cầu cài nginx
       ↓
APT đọc metadata repository: tên, phiên bản, kiến trúc, dependency
       ↓
Chọn nginx và các package cần thiết
       ↓
Tải, xác minh, cài đặt và ghi nhận package đã cài
       ↓
Kiểm tra ứng dụng/dịch vụ có chạy đúng hay không
```

Sơ đồ phân biệt hai kết quả: **cài package thành công** và **dịch vụ hoạt động đúng**. Hai việc cần được kiểm tra riêng. Trên Debian/Ubuntu, `apt show nginx` giúp xem thông tin package; `dpkg -S /đường/dẫn/file` tìm package sở hữu một file **đã cài**. Ví dụ, nếu một lệnh không hoạt động, biết file thuộc package nào giúp bạn tìm đúng tài liệu và changelog. `dpkg -S` không tìm file của package chưa cài; [Debian Wiki về APT](https://wiki.debian.org/AptCLI) mô tả giới hạn này.

Ví dụ ứng dụng A cần thư viện B ở một khoảng phiên bản nhất định. Nếu bạn thêm repository của một release khác chỉ để lấy A, package manager có thể kéo theo B mới hơn. Các chương trình khác vẫn trông đợi B cũ có thể lỗi. Vấn đề không chỉ là “cài được hay không”, mà còn là **toàn bộ tập package có tương thích và được hỗ trợ hay không**.

Hãy hình dung hệ hiện tại đã được kiểm thử với `libX` dòng 1. Một repository của release khác cung cấp ứng dụng mới yêu cầu `libX` dòng 2. Khi kéo cả thư viện mới vào, phần mềm cũ có thể không còn tương thích; package manager cũng có thể báo xung đột trước khi cài. Kết quả tùy metadata và chính sách resolver, nên đây là **kịch bản rủi ro**, không phải điều chắc chắn xảy ra mỗi lần thêm repository. Cách an toàn là dùng repository được distro hỗ trợ cho đúng release, đọc dependency và kiểm thử thay đổi trên môi trường phù hợp.

Fixed release ưu tiên một nền tảng có vòng đời rõ; rolling release đưa thay đổi liên tục. Không có lựa chọn tốt cho mọi tình huống: cần xét driver phần cứng, ứng dụng, quy trình cập nhật và khả năng phục hồi của đội vận hành.

Với **fixed release**, một bản phát hành giữ nền tảng tương đối ổn định và nhận cập nhật theo chính sách hỗ trợ; nâng cấp sang release mới là một bước riêng cần kiểm thử. Với **rolling release**, package được cập nhật liên tục hơn và không luôn có ranh giới nâng cấp lớn theo cùng cách. Cả hai vẫn cần backup, kiểm thử và kế hoạch quay lui. Chọn cách nào phụ thuộc yêu cầu hỗ trợ phần cứng, phần mềm, độ ổn định giao diện và khả năng vận hành của nhóm.

| Câu hỏi | Fixed release | Rolling release |
|---|---|---|
| Package mới đến bằng cách nào? | Thường qua cập nhật trong release; đổi nền tảng lớn qua nâng cấp release. | Nhiều package được nâng cấp liên tục trong cùng một hệ. |
| Điều phải theo dõi | Ngày hết hỗ trợ, bản vá và kế hoạch nâng cấp release. | Thông báo thay đổi, khả năng tương thích và việc cập nhật đều đặn. |
| Ví dụ để hình dung | Debian Stable. | Arch Linux. |

Bảng là mô hình khái quát, không có nghĩa fixed release không bao giờ có phần mềm mới hay rolling release luôn thiếu ổn định. [ArchWiki](https://wiki.archlinux.org/title/Arch_Linux) mô tả Arch là rolling release; tài liệu từng distro mới là nơi kiểm tra chính sách cụ thể của release bạn dùng.

## 4. Lab: nhận diện trước khi làm theo hướng dẫn

```bash
cat /etc/os-release
uname -r
uname -m
ps -p 1 -o pid,comm,args
command -v apt
command -v dnf
command -v pacman
command -v systemctl
```

Các lệnh trên chỉ đọc thông tin; một lệnh `command -v` không tìm thấy chương trình có thể trả mã thoát khác 0, đó là quan sát bình thường. `/etc/os-release` dùng các trường như `ID`, `VERSION_ID` để nhận diện **bản phát hành của user space**, theo đặc tả [os-release](https://man7.org/linux/man-pages/man5/os-release.5%40%40systemd.html). Đừng lấy một dòng trong đó làm bằng chứng rằng kernel, mọi package và mọi tiến trình đều cùng phiên bản.

### Đọc ý nghĩa từng lệnh

| Lệnh | Câu hỏi được trả lời | Điều chưa thể kết luận chỉ từ lệnh đó |
|---|---|---|
| `cat /etc/os-release` | User space tự nhận là distro/release nào? | Không chứng minh kernel được build bởi cùng distro; container có thể dùng kernel host. |
| `uname -r` | Kernel hiện đang chạy có chuỗi release nào? | Không cho biết toàn bộ distro hay mọi bản vá đã backport. |
| `uname -m` | Kiến trúc được kernel báo là gì? | Không cho biết tên package manager. |
| `ps -p 1 -o pid,comm,args` | Tiến trình PID 1 trong môi trường quan sát là gì? | Không chứng minh mọi dịch vụ đều do cùng công cụ quản lý. |
| `command -v apt`, `dnf`, `pacman`, `systemctl` | Lệnh có nằm trong `PATH` không? | Không chứng minh nó là công cụ đang được dùng hoặc `systemd` là PID 1. |

Ví dụ đọc kết quả **giả định**: `/etc/os-release` báo Debian, `uname -r` báo một chuỗi kernel riêng, `command -v apt` có đường dẫn còn `command -v dnf` không có. Kết luận hợp lý là user space tự nhận Debian và có `apt` trong `PATH`; không thể chỉ từ đó suy ra tất cả package đều đến từ repository chính thức hay máy có đúng một kernel đã cài. Hãy ghi kết quả thật của VM thay cho ví dụ này.

### Ví dụ mẫu: từ kết quả lệnh đến kết luận

Giả sử một VM lab cho kết quả **tự tạo để luyện cách đọc**, không phải kết quả đo trên máy bạn:

```text
/etc/os-release: ID=debian, VERSION_ID="13"
uname -r:       6.x.y-lab-amd64
uname -m:       x86_64
PID 1:          systemd
command -v apt: /usr/bin/apt
command -v dnf: không có kết quả
```

Đi từng bước:

1. `ID=debian` và `VERSION_ID="13"` cho biết **user space của ví dụ tự nhận là Debian release 13**. Chúng không chứng minh nơi kernel được build.
2. Chuỗi `6.x.y-lab-amd64` là **kernel hiện đang chạy** trong ví dụ; dấu `x`, `y` chỉ chỗ trống minh họa, không phải phiên bản thật. Chỉ một chuỗi release không đủ kiểm tra mọi bản vá hoặc tùy chọn build.
3. `x86_64` cho biết kiến trúc môi trường chạy. Nếu tải binary `aarch64`, cần kiểm tra cơ chế tương thích/emulation trước khi dùng; không thể mặc định chạy trực tiếp.
4. PID 1 là `systemd` **trong môi trường quan sát của ví dụ**. Trong VM, điều đó thường là init của guest; trong container, PID 1 có thể chỉ là tiến trình đầu tiên của container.
5. Có `/usr/bin/apt` và không tìm thấy `dnf` cho thấy cách bắt đầu hợp lý là tìm tài liệu Debian/APT. Vẫn cần kiểm tra repository và tên package trước khi cài.

Như vậy, một **hồ sơ hệ thống có bằng chứng** luôn mạnh hơn phỏng đoán kiểu “thấy `apt` thì mọi lệnh Ubuntu đều dùng được”.

Lệnh `command -v` trả mã khác 0 nếu công cụ không tồn tại; đó là kết quả quan sát hợp lệ. Ghi distro, architecture, kernel, PID 1 và package manager vào hồ sơ bài 01.

Hồ sơ sau bài này nên có thêm bảng ngắn:

| Thành phần | Kết quả trên máy của bạn | Bằng chứng |
|---|---|---|
| Distro và release | … | Các trường `ID`, `VERSION_ID` trong `/etc/os-release` |
| Kernel đang chạy | … | `uname -r` |
| Kiến trúc | … | `uname -m` |
| PID 1 | … | `ps -p 1 -o pid,comm,args` |
| Công cụ package tìm thấy | … | `command -v apt`, `command -v dnf`, `command -v pacman` |

Nếu đang ở container, VM hoặc hệ nhúng tối giản, ghi rõ bối cảnh. Đừng điền một công cụ chỉ vì distro thường dùng công cụ đó; hãy ghi bằng chứng quan sát được.

Tìm một hướng dẫn dành cho họ Debian và một hướng dẫn họ RPM. Không thực thi chúng ngay; chỉ xác định tên package, tên service và đường dẫn cấu hình khác nhau. Đầu ra là bảng đối chiếu ít nhất ba khác biệt.

Khi đối chiếu, ghi rõ **mục tiêu thao tác** trước rồi mới ghi lệnh/tên file của từng hệ. Ví dụ các cột có thể là “cài package”, “xem trạng thái service”, “đường dẫn cấu hình”. Nếu hai tài liệu dùng phiên bản ứng dụng khác nhau, ghi sự khác biệt đó; đừng coi mọi khác biệt đều do distro gây ra.

### Vì sao container Debian có thể báo kernel của host khác distro?

Một container Linux thông thường có **user space riêng** (các file, thư viện, ứng dụng của image) nhưng **chia sẻ kernel** của máy chạy container. Nếu host dùng Ubuntu và image của container là Debian, `cat /etc/os-release` bên trong container mô tả user space Debian, còn `uname -r` hỏi kernel mà container đang dùng chung. Điều này không mâu thuẫn: hai lệnh đang hỏi hai lớp khác nhau. [Docker Docs](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/) so sánh container với VM về điểm này.

```text
Host Ubuntu hoặc VM chạy Docker
├─ User space của host
├─ Container A: user space Debian  ─┐
├─ Container B: user space Alpine  ─┤ cùng dùng kernel của host Docker
└─ Linux kernel của host Docker   ←─┘
```

Nếu Docker chạy qua một VM, ví dụ trên máy desktop không có Linux kernel trực tiếp, “host Docker” trong sơ đồ là **VM Linux chạy Docker**, không nhất thiết là hệ điều hành desktop bên ngoài. Container cũng có thể có PID 1 riêng trong namespace của nó; `ps -p 1` bên trong container mô tả PID 1 **mà container nhìn thấy**, không chắc là PID 1 của host. Đây là lý do phải ghi môi trường quan sát trước khi diễn giải lệnh.

### Checklist trước khi áp dụng một hướng dẫn trên mạng

1. Xác định **môi trường**: máy vật lý, VM, container hay thiết bị nhúng. Tìm hiểu lệnh sẽ chạy ở host hay trong guest/container.
2. Đọc **distro/release** từ `/etc/os-release`. Kiểm tra hướng dẫn viết cho release nào.
3. Đọc **kiến trúc** bằng `uname -m`, nhất là trước khi tải binary hoặc build phần mềm. Binary cho kiến trúc khác thường không chạy trực tiếp nếu thiếu cơ chế hỗ trợ.
4. Đọc **kernel đang chạy** bằng `uname -r` khi hướng dẫn liên quan driver, module hoặc tính năng kernel.
5. Kiểm tra **PID 1 và công cụ có sẵn**. Có `systemctl` trong `PATH` không chứng minh systemd đang là init của môi trường hiện tại.
6. Đối chiếu **package, repository, service và file cấu hình** trong tài liệu của distro/release. Chỉ sau đó mới quyết định lệnh nào phù hợp.

Ví dụ đối chiếu **mang tính định hướng**, cần xác nhận lại trên release đang dùng:

| Việc cần làm | Họ Debian/Ubuntu | Họ Fedora/RHEL |
|---|---|---|
| Quản lý package cấp cao | `apt` | `dnf` |
| Định dạng/package manager cấp thấp | `.deb`, `dpkg` | `.rpm`, `rpm` |
| Package máy chủ Apache thường gặp | `apache2` | `httpd` |
| Tên service Apache thường gặp | `apache2.service` | `httpd.service` |
| Cây cấu hình Apache thường gặp | `/etc/apache2/` | `/etc/httpd/` |

Đừng dùng bảng để tự động thay thế chuỗi trong một tutorial: phiên bản package, module Apache và cách distro tổ chức file có thể khác. Mục đích của bảng là nhắc bạn **đặt đúng câu hỏi để kiểm chứng**.

Ví dụ Apache trong bảng được đối chiếu với [Ubuntu Server documentation](https://ubuntu.com/server/docs/how-to/web-services/install-apache2/) và [Fedora Developer Portal](https://developer.fedoraproject.org/start/sw/web-app/apache.html). Đây là tài liệu của hai hệ cụ thể; nó không biến bảng thành quy tắc cho mọi distro thuộc họ Debian hoặc RPM.

## 5. Mẹo và lỗi thường gặp

- Không chọn package theo tên gần giống mà bỏ qua mô tả và nguồn.
- Một container có thể báo user space Debian nhưng `uname` trả kernel host khác hẳn máy Debian thông thường.
- Có file unit systemd không chứng minh systemd đang là PID 1.
- Đọc release notes trước nâng cấp lớn; lỗi tương thích thường nằm ở user space, cấu hình và ứng dụng chứ không chỉ kernel.
- Đừng dùng “Linux”, “kernel”, “distro” và “shell” như các từ đồng nghĩa: mỗi từ chỉ một lớp khác nhau.
- `command -v` chỉ kiểm tra khả năng tìm thấy lệnh trong `PATH`; cần kiểm tra thêm PID 1, cấu hình và trạng thái thực tế trước khi chọn cách quản trị dịch vụ.

## 6. Tự kiểm tra

1. Vì sao `uname -r` không cho biết đầy đủ distro? **Nó nhận diện kernel, không toàn bộ user space.**
2. Cài kernel mới đã hoàn tất cập nhật hệ đang chạy chưa? **Chưa chắc; kiểm tra kernel sau reboot.**
3. Vì sao không đánh giá bản vá chỉ bằng số phiên bản upstream? **Distro có thể backport bản sửa.**
4. Máy có `systemctl` thì chắc chắn `systemd` đang là PID 1 không? **Không; kiểm tra PID 1 và ngữ cảnh chạy.**
5. Vì sao một container tự nhận Debian nhưng `uname -r` có thể khác kernel của VM Debian? **Container thường chia sẻ kernel host, còn `/etc/os-release` thuộc user space của container.**
6. Cài package mới đã chắc dịch vụ đang chạy dùng mã mới chưa? **Chưa; tiến trình có thể vẫn dùng mã đã nạp trước đó và cần được kiểm tra/restart theo quy trình.**
7. Hai máy cùng `uname -r` có chắc kernel binary và tính năng giống hệt không? **Không; bản vá, cấu hình build và module có thể khác.**
8. `ls` chạy được thì có chắc đó là GNU Coreutils không? **Không; có thể là BusyBox hoặc cách triển khai khác. Kiểm tra file thực thi và package trên máy.**

## 7. Tổng kết mô hình tư duy

```text
Linux kernel             → cơ chế quản lý tài nguyên và giao diện system call
User space               → shell, thư viện, init, công cụ, ứng dụng
Distro                   → một cách tích hợp và duy trì kernel + user space
Repository / package     → nguồn và đơn vị phân phối phần mềm
Máy đang chạy            → phải quan sát distro, kernel, package, tiến trình riêng
```

Khi gặp một hướng dẫn ghi “trên Linux, chạy lệnh X”, hãy tự hỏi: **X thuộc kernel, công cụ user space hay package của một distro?** Sau đó kiểm tra release, kiến trúc, kernel, PID 1 và công cụ hiện có trước khi áp dụng. Câu hỏi này sẽ còn dùng lại ở các bài về system call, systemd, driver và container.

## Đọc thêm

Tra `man os-release`, `man uname`; đọc release notes và chính sách hỗ trợ chính thức của distro đã chọn. Các nguồn chính dùng để kiểm tra bài: [Linux kernel documentation](https://docs.kernel.org/), [Debian Reference: package management](https://www.debian.org/doc/manuals/debian-reference/ch02), [GNU Coreutils](https://www.gnu.org/software/coreutils/), [BusyBox](https://busybox.net/about.html), [Docker Docs: container và VM](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/).
