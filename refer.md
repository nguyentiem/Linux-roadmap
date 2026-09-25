Linux và Distribution: Kernel, Distro, Package, Repository
Mục tiêu
Sau bài này, bạn cần phân biệt rõ:

Linux kernel là gì.
Distribution (distro) là gì.
User space gồm những thành phần nào.
Sự khác nhau giữa distro version, kernel version, package version và application version.
Repository và package manager hoạt động như thế nào.
Vì sao không nên trộn repository giữa các release.
Sự khác nhau giữa fixed release và rolling release.
Vì sao container có thể là Debian nhưng lại dùng kernel của Ubuntu host.
Cách nhận diện môi trường Linux trước khi làm theo một hướng dẫn trên Internet.
1. Kernel không phải toàn bộ hệ thống
Linux về bản chất là kernel.

Kernel là phần lõi của hệ điều hành, chạy ở kernel space và chịu trách nhiệm quản lý các tài nguyên quan trọng của máy tính.

Một hệ Linux có thể hình dung như sau:

+--------------------------------------------------+
| Application                                      |
| Firefox, gcc, Python, Docker, nginx...            |
+--------------------------------------------------+
| Shell + system utilities                         |
| bash, ls, cp, ps, grep, systemctl...              |
+--------------------------------------------------+
| Libraries                                        |
| glibc / musl / libstdc++...                      |
+--------------------------------------------------+
| Init / Service manager                           |
| systemd / OpenRC / BusyBox init...               |
+--------------------------------------------------+
| Linux Kernel                                     |
| process | memory | filesystem | network | driver |
+--------------------------------------------------+
| Hardware                                         |
| CPU | RAM | SSD | NIC | USB | GPU...             |
+--------------------------------------------------+
Kernel chịu trách nhiệm những việc như:

Process management
Memory management
Device drivers
Filesystem
Networking
System calls
Permission / protection
Ví dụ một chương trình C gọi:

read(fd, buffer, 100);
Luồng xử lý khái niệm có thể là:

Application
    |
    | read()
    v
C library
    |
    | syscall
    v
Linux kernel
    |
    v
Filesystem / driver
    |
    v
SSD
Kernel cung cấp cơ chế thấp tầng để chương trình truy cập tài nguyên phần cứng.

Tuy nhiên nếu chỉ có kernel thì chưa tạo thành một môi trường sử dụng hoàn chỉnh.

Bạn vẫn cần:

Shell
Libraries
Init system
System utilities
Package manager
Applications
Ví dụ:

bash
ls
cp
mv
grep
systemctl
apt
gcc
python
Những chương trình này không phải Linux kernel.

2. Ví dụ: lệnh ls có phải là Linux kernel không?
Không.

Lệnh:

ls
thường là một chương trình user-space.

Trên Debian/Ubuntu, nó thường thuộc package:

coreutils
Khi ls muốn đọc nội dung thư mục, nó sử dụng các thư viện và system call do kernel cung cấp.

Có thể hình dung:

ls
 |
 v
glibc
 |
 v
Linux syscall
 |
 v
VFS
 |
 v
filesystem
Do đó:

Linux kernel != toàn bộ hệ điều hành
3. GNU liên quan gì đến Linux?
GNU cung cấp rất nhiều công cụ user-space phổ biến.

Ví dụ:

Bash
coreutils
gcc
glibc
grep
sed
awk
Một hệ Debian/Ubuntu điển hình có thể hình dung là:

Linux kernel
+
GNU tools
+
systemd
+
apt
+
Debian/Ubuntu packages
+
desktop / applications
Đó là lý do đôi khi ta gặp thuật ngữ:

GNU/Linux
Tuy nhiên Linux không bắt buộc phải dùng toàn bộ GNU.

Ví dụ embedded Linux có thể dùng:

Linux kernel
+
BusyBox
+
musl
thay vì:

Linux kernel
+
GNU coreutils
+
glibc
+
bash
BusyBox đặc biệt phổ biến trên:

Router
IoT device
Embedded Linux
Recovery environment
Initramfs
Nó gom rất nhiều utility vào một binary nhỏ.

Ví dụ:

/bin/ls
/bin/cp
/bin/mv
/bin/sh
có thể đều trỏ tới:

/bin/busybox
4. Distribution là gì?
Distribution, hay distro, là một hệ thống hoàn chỉnh được xây dựng bằng cách tích hợp Linux kernel với nhiều thành phần khác.

Ví dụ distro phải quyết định:

Kernel version nào?
Init system nào?
glibc hay musl?
Package manager nào?
Repository nào?
Package nào cài mặc định?
Cấu hình mặc định ra sao?
Cách cập nhật thế nào?
Security patch được quản lý thế nào?
Chu kỳ hỗ trợ bao lâu?
Một số distro phổ biến:

               Linux kernel
                    |
        +-----------+-----------+
        |           |           |
      Debian      Fedora       Arch
        |           |           |
      Ubuntu       RHEL       Manjaro
Các distro có thể cùng sử dụng Linux kernel nhưng user space và công cụ quản trị khác nhau.

Ví dụ cài nginx:

Ubuntu / Debian:

sudo apt install nginx
Fedora:

sudo dnf install nginx
Arch Linux:

sudo pacman -S nginx
Cùng là nginx nhưng cách quản lý package khác nhau.

5. Hai distro cùng kernel version chưa chắc giống nhau
Giả sử upstream Linux phát hành:

Linux 6.8
Ubuntu có thể lấy source đó rồi bổ sung:

Linux upstream 6.8
        |
        + Ubuntu patches
        + Ubuntu config
        + driver patches
        + security patches
        |
        v
Ubuntu kernel
Một distro khác cũng có thể dùng Linux 6.8 nhưng:

Patch khác.
Config khác.
Driver enable khác.
Module khác.
Security fix khác.
Ví dụ:

Ubuntu:

CONFIG_X=y
CONFIG_Y=m
Distro khác:

CONFIG_X=n
CONFIG_Y=y
Do đó cùng hiện:

6.8
không có nghĩa kernel binary giống nhau hoàn toàn.

6. Những lớp phiên bản cần phân biệt
Có ít nhất 4 lớp phiên bản quan trọng:

Distro version
Kernel version
Package version
Running application version
Chúng không phải cùng một thứ.

6.1. Distro version
Dùng:

cat /etc/os-release
Ví dụ:

NAME="Ubuntu"
VERSION="24.04 LTS"
ID=ubuntu
VERSION_ID="24.04"
Nó trả lời câu hỏi:

Hệ thống user space này thuộc distro nào và release nào?

Ví dụ:

Ubuntu 24.04
Debian 13
Fedora 42
Nó không cho biết chính xác kernel hiện tại đang chạy.

6.2. Kernel đang chạy
Dùng:

uname -r
Ví dụ:

6.8.0-84-generic
Lệnh này trả lời:

Kernel thực tế đã được boot và đang chạy là kernel nào?

Giả sử bạn chạy:

sudo apt upgrade
và package manager cài kernel mới:

linux-image-6.8.0-85
Nhưng máy chưa reboot.

Khi đó có thể xảy ra:

Installed kernel:
6.8.0-85

Running kernel:
6.8.0-84
uname -r vẫn trả:

6.8.0-84
Sau khi reboot, máy mới có thể chạy:

6.8.0-85
Do đó:

Cài kernel mới không đồng nghĩa kernel đang chạy được thay ngay lập tức.

6.3. Package version
Ví dụ cài nginx:

sudo apt install nginx
Package manager ghi nhận version package đã cài.

Có thể kiểm tra bằng:

apt list --installed | grep nginx
Ví dụ:

nginx 1.24.0-2ubuntu7
Đây là:

package version
Nó chưa chắc bằng version của process nginx đang chạy trong RAM.

6.4. Running application version
Giả sử nginx đang chạy version:

1.24.0
Sau đó bạn update package:

sudo apt upgrade
Binary trên disk được thay thành:

1.24.1
Nhưng process cũ chưa restart.

Khi đó có thể xảy ra:

Disk:
nginx 1.24.1

RAM:
nginx process 1.24.0
Để process dùng binary mới, thường cần restart:

sudo systemctl restart nginx
Vì vậy cần phân biệt:

Package installed version
và:

Application actually running version
7. Backport là gì?
Backport là việc lấy một bản sửa lỗi hoặc tính năng nhỏ từ phiên bản upstream mới hơn rồi đưa ngược vào phiên bản cũ mà distro đang duy trì.

Ví dụ upstream:

software 1.0
software 1.1
software 1.2
software 1.3
Một lỗi bảo mật được sửa ở:

1.3
Distro không nhất thiết nâng toàn bộ từ:

1.0 -> 1.3
Thay vào đó họ có thể làm:

1.3
 |
 | security fix
 v
1.0 + patch
Đó là backport.

Lý do là distro ổn định thường muốn tránh thay đổi API hoặc behavior quá lớn.

Vì vậy một package có version upstream trông cũ chưa chắc thiếu security fix.

Không nên kết luận chỉ bằng số version.

8. Repository là gì?
Repository là kho chứa:

Package
Metadata
Dependency information
Version
Architecture
Hash
Chữ ký xác minh
Ví dụ:

sudo apt install nginx
APT sẽ tra cứu repository để tìm package nginx.

Khái niệm:

Ubuntu repository
       |
       + metadata
       |
       + nginx.deb
       + openssl.deb
       + libc.deb
       + ...
Metadata có thể chứa:

package name
version
dependency
architecture
hash
signature
Ví dụ nginx phụ thuộc:

nginx
 ├── libc
 ├── openssl
 └── pcre
Package manager có nhiệm vụ giải dependency.

Bạn chỉ cần chạy:

sudo apt install nginx
Package manager có thể tự cài thêm các dependency cần thiết.

9. Package manager biết file thuộc package nào
Package manager còn có thể ghi nhận một file được cài từ package nào.

Ví dụ trên Debian/Ubuntu:

dpkg -S /bin/ls
Có thể trả:

coreutils: /bin/ls
Có nghĩa:

/bin/ls
thuộc package:

coreutils
Điều này rất hữu ích khi debug hệ thống.

Ví dụ bạn gặp file:

/usr/lib/x86_64-linux-gnu/libXYZ.so
và muốn biết:

File này được cài từ package nào?

Package manager có thể giúp tìm ra nguồn của file.

10. Vì sao không nên trộn repository?
Giả sử hệ thống đang chạy:

Ubuntu 24.04
nhưng bạn thêm repository của release khác.

Một package mới có thể yêu cầu:

glibc >= 2.41
trong khi hệ thống hiện tại chỉ có:

glibc 2.39
Hoặc:

App A -> libX 1.x
App B -> libX 2.x
Nếu package manager kéo version không tương thích, có thể dẫn đến:

dependency conflict
broken package
service không chạy
desktop lỗi
upgrade lỗi
Do đó không nên tùy tiện trộn repository giữa các distro hoặc release.

11. Fixed release và Rolling release
Fixed release
Ví dụ:

Ubuntu
Debian Stable
RHEL
Một release sẽ được giữ tương đối ổn định trong một khoảng thời gian.

Ví dụ:

Ubuntu 24.04
    |
    + kernel tương đối ổn định
    + glibc tương đối ổn định
    + package API tương đối ổn định
    + security patches
Ưu điểm:

Dễ kiểm thử.
Predictable.
Ít thay đổi lớn.
Phù hợp production.
Phù hợp server.
Phù hợp enterprise.
Phù hợp môi trường build ổn định.
Rolling release
Ví dụ tiêu biểu:

Arch Linux
Software được cập nhật liên tục:

A
 -> A'
 -> A''
 -> A'''
 -> ...
Ưu điểm:

Package mới.
Kernel mới.
Driver mới.
Feature mới sớm hơn.
Đổi lại:

Thay đổi thường xuyên hơn.
Nguy cơ incompatibility cao hơn.
Cần theo dõi release notes và update cẩn thận hơn.
Không có mô hình nào tốt nhất cho mọi tình huống.

Cần cân nhắc:

Hardware driver
Application compatibility
Update policy
Recovery capability
Operational process
12. Lab: nhận diện hệ thống trước khi làm theo hướng dẫn
Chạy các lệnh:

cat /etc/os-release
uname -r
uname -m
ps -p 1 -o pid,comm,args
command -v apt
command -v dnf
command -v systemctl
cat /etc/os-release
Dùng để xác định distro.

Ví dụ:

Ubuntu
Debian
Fedora
Arch
uname -r
Dùng để xem kernel hiện đang chạy.

Ví dụ:

6.8.0-84-generic
uname -m
Dùng để kiểm tra CPU architecture.

Ví dụ:

x86_64
aarch64
armv7l
Điều này quan trọng khi tải binary hoặc build software.

Ví dụ binary:

x86_64
không thể trực tiếp chạy trên:

ARM64
nếu không có cơ chế emulation phù hợp.

ps -p 1 -o pid,comm,args
Dùng để xem process có PID 1.

Ví dụ:

PID COMMAND
1   systemd
PID 1 rất quan trọng vì nó thường là init process của user space.

command -v apt
Kiểm tra apt có tồn tại trong PATH hay không.

Ví dụ:

/usr/bin/apt
Nếu không tồn tại, command trả exit status khác 0.

command -v dnf
Fedora/RHEL thường có:

/usr/bin/dnf
Ubuntu thông thường không có.

command -v systemctl
Kiểm tra binary systemctl có tồn tại.

Nhưng lưu ý:

Có systemctl không có nghĩa systemd đang là PID 1.

Muốn kiểm tra init system thực sự đang chạy, cần xem:

ps -p 1 -o pid,comm,args
13. Container có thể là Debian nhưng kernel lại là Ubuntu
Đây là ví dụ rất quan trọng để phân biệt kernel và user space.

Giả sử host là:

Ubuntu
Linux kernel 6.8
Sau đó chạy:

docker run -it debian bash
Trong container:

cat /etc/os-release
có thể báo:

Debian GNU/Linux
Nhưng:

uname -r
vẫn có thể trả kernel của Ubuntu host.

Bởi vì Docker container thông thường không chạy kernel riêng.

Kiến trúc:

               Host
+---------------------------------+
| Ubuntu userspace                |
|                                 |
| Container A: Debian userspace   |
| Container B: Alpine userspace   |
| Container C: Ubuntu userspace   |
|               |                 |
|               v                 |
|        Linux kernel 6.8         |
+---------------------------------+
| Hardware                        |
+---------------------------------+
Các container dùng chung kernel host.

Do đó:

Distro user space != kernel
14. Vì sao cần biết distro trước khi copy lệnh trên Internet?
Một hướng dẫn Linux không nhất thiết áp dụng cho tất cả distro.

Ví dụ Debian/Ubuntu:

sudo apt install nginx
Fedora:

sudo dnf install nginx
Arch:

sudo pacman -S nginx
Tên package cũng có thể khác.

Ví dụ Debian/Ubuntu:

sudo apt install build-essential
Fedora sử dụng package hoặc package group khác.

Tên service có thể khác.

Ví dụ:

apache2.service
so với:

httpd.service
Đường dẫn config cũng có thể khác:

/etc/apache2/
so với:

/etc/httpd/
Do đó trước khi làm theo tutorial cần xác định:

Distro nào?
Distro version nào?
Architecture gì?
Kernel nào?
Package manager nào?
Init system nào?
15. Bảng đối chiếu Debian và RPM-based distro
Thành phần	Debian/Ubuntu	Fedora/RHEL
Package format	.deb	.rpm
Package manager	apt, dpkg	dnf, rpm
Cài nginx	apt install nginx	dnf install nginx
Apache package	apache2	httpd
Apache service	apache2.service	httpd.service
Apache config	/etc/apache2/	/etc/httpd/
Bảng này chỉ là ví dụ. Luôn kiểm tra tài liệu của distro/version đang dùng.

16. Mẹo và lỗi thường gặp
Không chọn package chỉ dựa vào tên gần giống
Hãy kiểm tra:

Description.
Repository.
Version.
Maintainer.
Architecture.
Dependency.
Container có thể báo Debian nhưng kernel lại của host
Trong container:

cat /etc/os-release
và:

uname -r
có thể phản ánh hai lớp khác nhau.

Có file systemd unit không có nghĩa systemd đang chạy
Một filesystem có thể chứa:

/usr/lib/systemd/
/etc/systemd/
nhưng PID 1 vẫn có thể là process khác.

Luôn kiểm tra:

ps -p 1 -o pid,comm,args
Đọc release notes trước khi nâng cấp lớn
Lỗi tương thích thường không chỉ đến từ kernel.

Nó có thể nằm ở:

glibc
Python
OpenSSL
systemd
desktop environment
application
configuration
package dependency
driver
17. Checklist nhận diện một hệ Linux
Khi debug hoặc đọc tutorial, nên thu thập ít nhất:

Distro:
Ubuntu 24.04 LTS

Architecture:
x86_64

Kernel:
6.8.0-84-generic

PID 1:
systemd

Package manager:
apt / dpkg

C library:
glibc
Các lệnh gợi ý:

cat /etc/os-release
uname -r
uname -m
ps -p 1 -o pid,comm,args
command -v apt
command -v dnf
command -v pacman
command -v systemctl
ldd --version
18. Tổng kết
Các khái niệm cần nhớ:

Linux
    = kernel

Distro
    = Linux kernel
    + user space
    + libraries
    + init system
    + package manager
    + repositories
    + default configuration
    + update/security policy

Repository
    = nguồn cung cấp package và metadata

Package
    = phần mềm được distro đóng gói và quản lý

Running application
    = process thực tế đang chạy trong RAM
Không nên hiểu:

Ubuntu = Linux kernel
Debian = Linux kernel
Fedora = Linux kernel
Mà nên hiểu:

Ubuntu
 ├── Linux kernel
 ├── GNU / user-space tools
 ├── systemd
 ├── glibc
 ├── apt / dpkg
 ├── Ubuntu repositories
 └── Ubuntu configuration / policies
19. Ý nghĩa đối với việc học Linux
Hiểu được sự khác nhau giữa kernel, distro và user space sẽ giúp bạn học các chủ đề sau dễ hơn:

System call
glibc
Process
PID 1
systemd
Shell
Package management
Shared library
Kernel module
Driver
Docker
Container
chroot
initramfs
Embedded Linux
BusyBox
musl
Cross compilation
Đây là nền tảng quan trọng trước khi đi sâu vào Linux system programming và embedded Linux.