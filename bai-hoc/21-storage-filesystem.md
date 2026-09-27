# Bài 21 — Storage stack và filesystem

[Mục lục](../README.md) · [← Bài 20](20-real-time-linux.md) · [Bài 22 →](22-lvm-raid-backup.md)

## Mục tiêu: từ tên file, làm sao biết dữ liệu nằm ở đâu?

Tình huống xuyên suốt là lưu `a.txt`, tạo tên thứ hai cho nó rồi tháo/gắn lại vùng lưu trữ. Bạn sẽ phân biệt thiết bị, phân vùng và filesystem; theo đường tìm tên đến dữ liệu; hiểu inode và hai loại link; đọc mount/UUID/dung lượng; tạo ext4 trên image riêng trong VM rồi tháo dọn đúng thứ tự. Cần nền bài 07, 10 và 17. Phần đọc thông tin có thể làm trên máy hiện tại; phần tạo loop/format/mount chỉ làm trong VM lab, không chọn ổ hệ thống.

**Storage**, lưu trữ, là nơi giữ dữ liệu, thường là SSD, HDD hoặc thiết bị ảo. **Stack** là chồng các lớp xử lý cùng một yêu cầu, mỗi lớp hiểu một kiểu thông tin khác nhau. Tên `/home/ban/a.txt` là thông tin lớp tên file, chưa phải địa chỉ một sector trên ổ. Nếu ứng dụng nói hết dung lượng, ta cần xác định lớp nào hết trước khi sửa.

## 1. Thiết bị, phân vùng và filesystem có phải cùng một thứ?

**Block device**, thiết bị truy cập theo khối, cho phép đọc/ghi vùng dữ liệu bằng địa chỉ và độ dài; một SSD và một thiết bị logic LVM đều có thể xuất hiện như block device. **Block** là đơn vị dữ liệu mà một lớp quản lý; block của filesystem không nhất thiết cùng kích thước sector mà thiết bị báo. **Device node**, file thiết bị, là điểm truy cập trong `/dev`, như `/dev/vda`; nó không phải file văn bản chứa toàn bộ dữ liệu ổ. `lsblk` liệt kê quan hệ các block device, còn `ls -l /dev/vda` thường có ký tự `b` để chỉ loại này.

**Partition**, phân vùng, là một khoảng của thiết bị được khai báo trong bảng phân vùng. **GPT** và **MBR** là hai kiểu mô tả bảng đó; chúng giúp biết vùng nào bắt đầu/độ dài bao nhiêu, không quyết định cách tổ chức file bên trong. Ví dụ `/dev/vda` là ổ VM, `/dev/vda1` có thể là phân vùng đầu. Một thiết bị có thể không chia partition; lab sẽ đặt filesystem trực tiếp lên một thiết bị loop riêng.

**Filesystem**, hệ thống file, là cách tổ chức tên, thư mục, thuộc tính và nội dung file trên vùng lưu trữ hoặc trong bộ nhớ. ext4, XFS và Btrfs là những cách triển khai khác nhau. **Format**, tạo cấu trúc filesystem ban đầu, ghi những cấu trúc quản lý lên vùng đích; nó có thể làm dữ liệu cũ không truy cập được. `mkfs.ext4` là công cụ format ext4, không phải lệnh “mở một ổ để xem”. Không format một thiết bị chỉ vì nó chưa được mount.

```text
Ổ /dev/vda (block device)
 ├─ /dev/vda1 (partition) → filesystem FAT → dữ liệu EFI
 └─ /dev/vda2 (partition) → filesystem ext4 → file Linux

File image của lab → loop device /dev/loopN → filesystem ext4
                                        (không có partition)
```

Các mũi tên là “cung cấp vùng cho lớp tiếp theo”, không phải thứ tự copy dữ liệu. Sơ đồ đầu chỉ minh họa một cách bố trí VM. Ở sơ đồ thứ hai, **image** là file thường chứa các byte mô phỏng một vùng lưu trữ; **kernel** là lõi hệ điều hành quản lý tài nguyên; **loop device** là block device kernel tạo để truy cập các byte của file đó như một thiết bị. Loop không biến image thành ổ độc lập: dữ liệu image vẫn phụ thuộc filesystem và ổ chứa nó.

Tự nhận diện mà chưa sửa gì:

```bash
lsblk -o NAME,TYPE,SIZE,FSTYPE,UUID,MOUNTPOINTS
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS /
```

`NAME` là tên, `TYPE` phân biệt disk/part/lvm/loop tùy hệ, `SIZE` là kích thước thiết bị logic, `FSTYPE` là loại cấu trúc đã nhận diện, `UUID` là mã nhận diện filesystem/lớp được công cụ nhận biết, `MOUNTPOINTS` là những vị trí đang gắn. Trống FSTYPE có thể là vùng chưa format, lớp cha của volume, loại chưa nhận diện hoặc thiếu quyền; không phải bằng chứng “ổ rỗng nên được xóa”. Trong container, danh sách thiết bị/mount có thể khác host hoặc bị hạn chế.

## 2. Ứng dụng dùng tên file, kernel chuyển tên ấy thành dữ liệu ra sao?

**Process**, tiến trình, là một lần chạy chương trình có bộ nhớ và tài nguyên riêng. **Kernel**, phần lõi hệ điều hành, cung cấp cơ chế truy cập tài nguyên cho process. **System call**, lời gọi hệ thống, là điểm chương trình yêu cầu kernel làm việc, như mở/đọc file; bài 16 đã quan sát các lời gọi này. **VFS**, Virtual File System, là lớp giao diện file thống nhất trong kernel để ứng dụng dùng `open`, `read`, `write` trên nhiều filesystem mà không cần biết cách ext4 hay XFS lưu cấu trúc bên trong.

**Metadata** là thông tin mô tả dữ liệu, như chủ file, quyền, kích thước và thời gian, khác nội dung dòng chữ trong file. **Inode** là đối tượng nhận diện một file/thư mục trong filesystem, giữ metadata cùng thông tin tìm nội dung theo thiết kế filesystem. Số inode chỉ có ý nghĩa trong filesystem đó; hai filesystem có thể cùng có inode `123`. Tên file thường nằm trong thư mục, không phải là trường tên duy nhất của inode.

**Directory**, thư mục, tổ chức các entry ánh xạ tên tới đối tượng file; ví dụ thư mục `project` có entry `a.txt` trỏ inode của file ấy. **Dentry**, đối tượng entry tên trong kernel, hỗ trợ biểu diễn/tra cứu quan hệ tên và thư mục trong bộ nhớ. **Cache**, bộ nhớ đệm, giữ thông tin đã dùng để giảm phải đọc lại; dentry cache có thể chứa cả kết quả tên không tồn tại. Dentry không phải một file metadata cố định trên ổ mà bạn cần sao lưu riêng. Xem [VFS của kernel](https://docs.kernel.org/filesystems/vfs.html) để phân biệt đối tượng tên, inode và file đang mở.

**File descriptor**, số nhận diện file mở trong process, ví dụ `3`, cho chương trình tiếp tục đọc/ghi mà không tìm lại từ tên mỗi lần. **Page cache** là bộ nhớ đệm nội dung file do kernel quản lý; một phần dữ liệu đọc có thể đã ở RAM, bộ nhớ làm việc, nên không phải mọi `read` đều chạm SSD.

```text
Process yêu cầu mở /project/a.txt
  → VFS lần theo /, project, a.txt và các mount
  → tìm dentry/inode → kiểm tra quyền và mở → cấp descriptor
Process read(descriptor)
  → dùng page cache nếu có
  → filesystem ánh xạ vùng nội dung khi cần đọc lưu trữ
  → block layer → lớp ánh xạ nếu có → driver → thiết bị
```

**Permission**, quyền truy cập, cho biết tài khoản nào được đọc/ghi/thực thi; `ls -l` cho các dấu `r/w/x`. Đi qua thư mục cần quyền tìm kiếm (`x`), không chỉ quyền đọc file cuối. **Block layer** là phần kernel tổ chức các yêu cầu tới thiết bị khối. **Driver**, trình điều khiển, là mã giao tiếp với loại thiết bị cụ thể. Các lớp ánh xạ như LVM, RAID hay mã hóa biến địa chỉ khối logic thành yêu cầu ở lớp dưới; bài 22 giải thích từng lớp. Thứ tự các lớp tùy bố trí, không cố định một sơ đồ cho mọi máy; filesystem mạng hoặc tmpfs trong bộ nhớ cũng không đi theo toàn bộ đường tới ổ vật lý này.

Mũi tên đầu của sơ đồ là tìm tên và kiểm tra điều kiện mở; các mũi tên sau là đường đọc nội dung khi cần. Tên đổi không nhất thiết làm descriptor đang mở đổi sang một file mới: descriptor giữ tham chiếu đối tượng đã mở. Đây là nền để hiểu vì sao xóa tên rồi mà dung lượng có thể chưa được giải phóng.

## 3. Hai tên cho một dữ liệu: hard link và symlink khác gì?

**Hard link**, liên kết cứng, thêm một entry tên trỏ tới cùng inode. Không có tên nào bắt buộc là “bản gốc” sau khi tạo link. Khi sửa nội dung qua một tên, tên kia nhìn thấy cùng nội dung; xóa một tên chỉ giảm số liên kết, không lập tức xóa dữ liệu nếu còn tên hoặc tham chiếu mở. Thông thường không tạo hard link thư mục và không tạo hard link vượt filesystem.

**Symlink**, liên kết tượng trưng, là file đặc biệt chứa đường dẫn đích; khi truy cập theo link, kernel tiếp tục tìm đường dẫn ấy. Nó có inode riêng, có thể trỏ qua filesystem khác hoặc đến tên chưa tồn tại. Đích tương đối được hiểu từ thư mục chứa symlink, không phải thư mục hiện tại của người dùng. `ls -l` thường thấy `name -> target`; `readlink name` đọc chuỗi đích.

Lab nhỏ không cần sudo, dùng thư mục mới để không ghi đè file hiện có:

```bash
link_lab=$(mktemp -d "$HOME/link-lab.XXXXXX")
printf 'version one\n' > "$link_lab/a.txt"
ln -- "$link_lab/a.txt" "$link_lab/b.txt"
ln -s -- a.txt "$link_lab/shortcut"
ls -li -- "$link_lab/a.txt" "$link_lab/b.txt" "$link_lab/shortcut"
stat -c 'device=%d inode=%i links=%h size=%s name=%n' \
    "$link_lab/a.txt" "$link_lab/b.txt" "$link_lab/shortcut"
rm -- "$link_lab/a.txt"
cat -- "$link_lab/b.txt"
cat -- "$link_lab/shortcut"
```

Kết quả minh họa: `a.txt` và `b.txt` cùng device/inode, link count `2`; symlink có inode khác. `stat` mặc định báo đối tượng symlink, muốn xem đích có thể dùng `stat -L` trước khi xóa. Sau xóa `a.txt`, `b.txt` vẫn đọc `version one`, symlink relative `a.txt` thành **dangling link**, link có đích không tồn tại. Lỗi `cat shortcut` là kết quả mong đợi của thử nghiệm, không phải lỗi filesystem. Xóa riêng file `b.txt`, symlink `shortcut`, rồi `rmdir "$link_lab"` để dọn; nếu thư mục không rỗng, rmdir sẽ từ chối thay vì xóa thêm dữ liệu.

Bạn kiểm chứng quan hệ bằng cả số device và inode, không chỉ inode. Các cơ chế copy-on-write/reflink của một số filesystem cho phép hai file chia sẻ block mà vẫn có inode riêng; đừng gọi mọi trường hợp chia sẻ dữ liệu là hard link. Xem [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html) và `man ln` của máy.

## 4. Mount đưa filesystem vào cây tên, nhưng có chuyển dữ liệu không?

**Mount** là thao tác gắn nội dung một filesystem vào thư mục gọi là **mount point**. Ví dụ gắn filesystem chứa `a.txt` vào `/mnt/lab` làm tên truy cập trở thành `/mnt/lab/a.txt`. Nó không copy toàn bộ file sang filesystem chứa thư mục `/mnt`. **Unmount**, tháo gắn, bỏ quan hệ truy cập ấy; dữ liệu lưu trữ không tự bị xóa.

Nếu mount point đã có file, mount thường che chúng trong cây tên hiện tại. Sau unmount, các file cũ lộ lại; không phải mount đã chuyển hay xóa chúng. Một process giữ thư mục hiện tại/file mở trong mount có thể làm unmount báo busy. **Shell** là chương trình diễn giải lệnh; nếu shell đã `cd` vào mount point, chính nó có thể giữ tham chiếu. `pwd` cho biết thư mục hiện tại, `cd "$HOME"` rời khỏi mount trước dọn.

**UUID** là mã nhận diện lưu cùng cấu trúc ở lớp liên quan; dùng `UUID=...` trong `/etc/fstab` thường bền hơn tên `/dev/sdX` thay theo thứ tự phát hiện. **fstab** là cấu hình các filesystem cần gắn cùng lựa chọn, không phải danh sách chính xác mount hiện tại. Clone một image có thể clone cả UUID; “ổn định” không bảo đảm duy nhất sau sao chép. Đối chiếu `lsblk -f`, `blkid` và thiết bị thực, không sửa UUID của ổ đang dùng theo suy đoán.

Một số **mount option**, lựa chọn khi gắn, có tác dụng giới hạn cụ thể:

| Option | Tác dụng chính | Giới hạn cần nhớ |
|---|---|---|
| `ro` | Gắn theo chế độ chỉ đọc | Một số filesystem có bước phục hồi journal có thể ghi lên nguồn; đọc tài liệu nếu cần giữ nguyên bằng chứng |
| `nodev` | Không diễn giải file đặc biệt thiết bị theo cách thông thường ở mount đó | Không chặn mọi kiểu truy cập thiết bị từ nơi khác |
| `nosuid` | Không áp đặc quyền qua bit setuid/setgid và khả năng file theo cơ chế Linux | Không bỏ mọi quyền mà process đã có |
| `noexec` | Không cho thực thi trực tiếp file ở mount đó | Trình thông dịch có thể vẫn đọc script làm dữ liệu |

**Setuid/setgid** là bit đặc biệt có thể làm chương trình thực thi với danh tính chủ/nhóm file theo cơ chế và điều kiện của hệ thống; **file capabilities** chia một số quyền đặc biệt cho file chương trình. Đây là lý do nosuid hữu ích nhưng không biến mount thành một môi trường an toàn toàn diện. `findmnt -T /đường/dẫn -o TARGET,SOURCE,FSTYPE,OPTIONS` giúp kiểm tra mount áp dụng cho một đường dẫn; option hiển thị phải được diễn giải với loại filesystem/kernel đang dùng. Xem [mount(8) của util-linux](https://man7.org/linux/man-pages/man8/mount.8.html).

## 5. Chọn ext4, XFS, Btrfs: cơ chế nào giải quyết vấn đề nào?

**Journaling**, ghi nhật ký filesystem, lưu một số thay đổi theo giao thức để sau sự cố có thể phục hồi cấu trúc nhất quán hơn. ext4 và XFS có journal, nhưng phạm vi và cách bảo vệ dữ liệu không giống mọi cấu hình. Trong ext4, chế độ thường dùng không ghi toàn bộ nội dung file qua journal; các lựa chọn `data=...` có bảo đảm khác nhau. Xem [journal ext4](https://docs.kernel.org/filesystems/ext4/journal.html). Journal filesystem không tự hoàn tất giao dịch database hay bảo vệ trước xóa nhầm.

**Copy-on-write (CoW)**, ghi sang chỗ mới khi thay đổi, tránh ghi đè trực tiếp block cũ trong các trường hợp cơ chế đó áp dụng. **Checksum** là giá trị kiểm tra tính toàn vẹn được tính từ dữ liệu; nó giúp phát hiện thay đổi ngoài mong đợi, không tự luôn có bản đúng để sửa. **Snapshot** là ảnh trạng thái tại một thời điểm của lớp hỗ trợ; nó không phải copy toàn bộ dữ liệu sang thiết bị độc lập. Btrfs thiết kế nhiều chức năng CoW, checksum và snapshot; một số lựa chọn như NOCOW có thể ảnh hưởng checksum dữ liệu. Đọc [tài liệu Btrfs](https://btrfs.readthedocs.io/en/latest/Introduction.html) cho các bảo đảm và giới hạn cụ thể.

Ví dụ bạn cần tăng dung lượng filesystem: ext4 dùng resize2fs theo điều kiện hỗ trợ; XFS dùng công cụ grow riêng và không hỗ trợ shrink thông thường; Btrfs có cách quản lý kích thước/thiết bị riêng. Không lấy lệnh sửa ext4 rồi đổi tên thiết bị XFS. **Repair**, sửa cấu trúc hỏng, cũng phụ thuộc loại filesystem: fsck chung có thể gọi công cụ cụ thể, không phải một thuật toán sửa mọi loại.

**Durability**, độ bền dữ liệu, nghĩa là dữ liệu tồn tại qua loại sự cố mà hệ thống cam kết. `write` thành công với dữ liệu buffered có thể chỉ mới vào cache; `fsync` là lời yêu cầu đồng bộ cụ thể, bài 23 sẽ đi sâu. Journal/checksum/snapshot và fsync giải quyết các khía cạnh khác nhau; không có một từ khóa nào thay toàn bộ thiết kế phục hồi.

## 6. Lab VM: tạo ext4 trên image riêng và tháo đúng thứ tự

### 6.1. Phạm vi và điều kiện trước thao tác

Chỉ dùng VM lab có sudo, util-linux, GNU coreutils và e2fsprogs. Không đưa block device thật của host vào VM cho bài này. Giữ cùng terminal để biến còn tồn tại, chạy từng khối và kiểm tra lỗi trước bước sau. `sudo` cấp quyền quản trị theo chính sách; `mktemp` tạo đường dẫn mới khó trùng; `truncate` đặt độ dài file và có thể tạo **sparse file**, file có khoảng trống logic chưa chiếm đủ block lưu trữ. Image 256 MiB không nhất thiết đã chiếm 256 MiB trên ổ host; khi ghi thêm, filesystem bên ngoài vẫn cần đủ chỗ.

```bash
command -v losetup
command -v mkfs.ext4
command -v findmnt
mkdir -p "$HOME/linux-lab/storage"
cd "$HOME/linux-lab/storage" || exit 1
image_file=$(mktemp "$PWD/ext4.XXXXXX.img")
truncate -s 256M "$image_file"
ls -lh -- "$image_file"
du -h -- "$image_file"
lab_loop=$(sudo losetup --find --show "$image_file")
printf 'Image=%s\nLoop=%s\n' "$image_file" "$lab_loop"
sudo losetup "$lab_loop"
```

`--find` chọn loop rảnh, `--show` in tên vừa gắn; nó không format. `ls -lh` báo kích thước logic, `du -h` báo block chiếm trên filesystem ngoài, có thể rất nhỏ trước format. Dừng nếu bất kỳ lệnh lỗi hoặc biến rỗng. Không copy tên `/dev/loopN` từ ví dụ vì số trên VM bạn khác.

### 6.2. Xác nhận đích trước format

```bash
sudo losetup --list --output NAME,BACK-FILE "$lab_loop"
sudo losetup --list --noheadings --output BACK-FILE "$lab_loop"
```

Đọc `NAME` đúng loop vừa nhận và `BACK-FILE` đúng đường dẫn `$image_file` vừa tạo. Cần **đối chiếu bằng mắt** cả hai; nếu không khớp hoặc không hiển thị, dừng, không format. Loop đã gắn image riêng mới tạo, không được thay `$lab_loop` bằng `/dev/sda`, `/dev/nvme...` hay thiết bị bất kỳ trong lsblk. Xem [losetup(8)](https://man7.org/linux/man-pages/man8/losetup.8.html) cho option của bản cài.

Sau khi xác nhận:

```bash
sudo mkfs.ext4 "$lab_loop"
lab_mount=$(mktemp -d /tmp/linux-fs.XXXXXX)
sudo mount "$lab_loop" "$lab_mount"
findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS "$lab_mount"
```

`mkfs.ext4` ghi cấu trúc mới, output thường có UUID, số block và inode; các con số tùy phiên bản/default. Không dùng `-F` để vượt cảnh báo nếu công cụ thấy đích đáng ngờ. `mount` tạo quan hệ truy cập; kiểm tra SOURCE là loop vừa xác nhận, FSTYPE `ext4`, TARGET đúng thư mục tạm. Nếu mount lỗi, không tiếp tục ghi file vì có thể bạn đang ghi vào thư mục thường trên filesystem ngoài.

### 6.3. Ghi file, tạo hard link và đọc dung lượng

```bash
printf 'persistent data\n' | sudo tee "$lab_mount/a.txt" >/dev/null
sudo ln -- "$lab_mount/a.txt" "$lab_mount/b.txt"
ls -li -- "$lab_mount/a.txt" "$lab_mount/b.txt"
df -h "$lab_mount"
df -i "$lab_mount"
```

`tee` ghi nội dung với quyền sudo; redirection `>/dev/null` chỉ bỏ bản in lặp trên terminal. Minh họa ls có cùng inode `12`, link count `2`, tên khác; inode thật không cố định. `df -h` có Size/Used/Avail/Use%/Mounted on cho accounting filesystem; usable space nhỏ hơn kích thước image vì metadata và chính sách dự trữ. `df -i` có Inodes/IUsed/IFree/IUse%: một filesystem có thể còn byte nhưng không còn inode để tạo thêm nhiều file nhỏ. Không mặc định mọi filesystem cấp inode theo cùng mô hình cố định như ext4.

### 6.4. Tháo/gắn lại để kiểm tra nội dung còn tồn tại

```bash
cd "$HOME"
sudo umount "$lab_mount"
sudo mount "$lab_loop" "$lab_mount"
sudo cat -- "$lab_mount/b.txt"
sudo umount "$lab_mount"
sudo losetup -d "$lab_loop"
rmdir "$lab_mount"
```

Kết quả mong đợi là `persistent data` sau gắn lại. Đây là phép thử vòng đời mount sạch, không phải chứng nhận chống mất điện. Unmount thành công rồi mới detach loop; `-d` ngắt liên hệ loop với image. Với thiết bị còn bị tham chiếu, việc detach có thể được đánh dấu autoclear và hoàn tất sau, hãy kiểm tra `sudo losetup -j "$image_file"`; chưa được xóa image nếu vẫn đang dùng. Nếu cần đợi sự kiện thiết bị, dùng `sudo udevadm settle` khi công cụ có sẵn rồi kiểm tra lại.

Image còn giữ dữ liệu để gắn lại học tiếp. Khi không cần, đã xác nhận không mount/không gắn loop, mới `rm -- "$image_file"`. Dọn dữ liệu cần kiểm tra đúng đường dẫn, không xóa cả thư mục lab bằng lệnh đệ quy.

Nếu unmount báo busy, chạy `sudo fuser -vm "$lab_mount"` hoặc `sudo lsof +f -- "$lab_mount"` nếu công cụ có. **fuser/lsof** giúp tìm process giữ tài nguyên/file mở; đọc PID và loại sử dụng, rời thư mục/đóng ứng dụng đúng của lab rồi thử lại. Không dùng kill hàng loạt hoặc lazy/force unmount để che nguyên nhân trong bài cơ bản này.

## 7. Vì sao `df` và `du` không giống nhau, hoặc máy còn byte vẫn báo đầy?

`df` hỏi filesystem về tổng lượng block/inode; `du` đi qua cây tên mà bạn có quyền nhìn và cộng block của file gặp được. File đã **unlink**, xóa một entry tên, vẫn có thể còn descriptor mở; du không thấy tên đó nhưng filesystem chưa giải phóng block. Mount che file cũ cũng làm du trên đường hiện tại không thấy phần bị che; reserved blocks, snapshot/CoW, quyền đọc và phạm vi filesystem cũng gây khác biệt.

**Reserved blocks**, block dự trữ, có thể dành một phần dung lượng ext4 cho mục tiêu quản trị/giảm tình trạng đầy; con số mặc định thay theo cấu hình. Không giảm dự trữ tùy tiện trên root chỉ để làm Avail đẹp hơn. Kiểm tra `df -h`, `df -i`, `findmnt -T đường_dẫn`; nếu có lsof, `sudo lsof +L1` giúp tìm file mở đã mất link, nhưng dữ liệu trên host có thể nhiều và cần hiểu process nào đang giữ.

| Dấu hiệu | Kiểm tra trước | Kết luận cần tránh |
|---|---|---|
| No space left, df byte còn | `df -i`, quota nếu có | Mọi lỗi đầy đều do ổ vật lý hết byte |
| Unmount busy | pwd, fuser/lsof, process của lab | Loop hỏng nên phải force detach |
| Sau mount không thấy file cũ ở mount point | SOURCE/TARGET trong findmnt | Dữ liệu cũ chắc đã bị xóa |
| UUID lặp sau clone | lsblk/blkid và đường thiết bị | UUID luôn duy nhất trong mọi tình huống |
| Filesystem có lỗi | Loại FS, log, dữ liệu cần bảo toàn | Chạy fsck sửa trên filesystem mounted |

**Quota** là hạn mức cho tài khoản/nhóm hoặc lớp quản lý khác; filesystem còn tổng dung lượng nhưng user đã chạm hạn mức vẫn có thể không ghi được. `fsck` sửa phải dùng đúng công cụ, đúng thiết bị và trạng thái phù hợp; mounted chỉ đọc vẫn là mounted, không mặc định sửa an toàn. Với dữ liệu quan trọng, bảo toàn ảnh/bản sao trước khi repair; bài lab không yêu cầu tạo hỏng rồi sửa.

## 8. Tự kiểm tra và mô hình ghi nhớ

1. Một ổ có một filesystem trực tiếp, không partition. Có sai mô hình Linux không? **Tiêu chí:** không, phân vùng là lớp tùy bố trí; block device có thể cấp vùng trực tiếp.
2. Hai file cùng inode nhưng khác filesystem. Có phải hard link không? **Tiêu chí:** cần cùng device/filesystem và inode; số inode không toàn cục.
3. Xóa a.txt, b.txt hard link vẫn đọc được. Dữ liệu “bản gốc” đã mất chưa? **Tiêu chí:** tên a mất, inode còn liên kết b; không có tên gốc đặc quyền.
4. Mount /data rồi không thấy file cũ dưới /data. Bạn kiểm tra gì? **Tiêu chí:** findmnt và việc che nội dung, không kết luận xóa.
5. Image 256 MiB và df báo nhỏ hơn. Những lớp nào làm chênh lệch? **Tiêu chí:** kích thước thiết bị, metadata/dự trữ filesystem và block ngoài cho sparse file khác nhau.
6. Tháo/gắn sạch đọc lại đúng. Đã chứng minh chống mất điện chưa? **Tiêu chí:** chưa; durability và ứng dụng cần giao thức riêng.
7. Đủ byte, hết inode: xóa một file lớn có nhất thiết giải quyết nhiều file mới? **Tiêu chí:** nó giải phóng inode theo số file thực sự bỏ, không theo số byte của file.

Bạn đạt khi nộp sơ đồ storage của `/` có bằng chứng lsblk/findmnt, kết quả link, vòng tháo/gắn và xác nhận detach; mọi output minh họa phải tách khỏi dữ liệu máy thật. Tự nhắc: tên → đối tượng file → filesystem → vùng khối → lớp ánh xạ → driver/thiết bị; mount chỉ nối cây tên vào vùng dữ liệu. Bài 22 thêm LVM/RAID/mã hóa và đặt ranh giới giữa khả dụng với backup.

## Nguồn và đối chiếu môi trường

- [VFS](https://docs.kernel.org/filesystems/vfs.html), [inode(7)](https://man7.org/linux/man-pages/man7/inode.7.html): mô hình tên/đối tượng file.
- [mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html), [losetup(8)](https://man7.org/linux/man-pages/man8/losetup.8.html): thao tác, option và vòng đời thiết bị loop.
- [mke2fs](https://man7.org/linux/man-pages/man8/mke2fs.8.html), [e2fsck](https://man7.org/linux/man-pages/man8/e2fsck.8.html): tạo/kiểm tra ext4 theo công cụ e2fsprogs.
- [Btrfs introduction](https://btrfs.readthedocs.io/en/latest/Introduction.html), [XFS grow](https://man7.org/linux/man-pages/man8/xfs_growfs.8.html): không áp cùng resize/repair cho mọi filesystem.

Tài liệu trực tuyến có thể mới hơn bản cài: xem `mount --version`, `losetup --version`, `mkfs.ext4 -V`, `man fstab` và help địa phương. Lab có tác động format/mount chỉ dành cho VM riêng và image được xác nhận, không khẳng định đã chạy trên host của người học.
