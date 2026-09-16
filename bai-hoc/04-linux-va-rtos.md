# Bài 04 — Linux và RTOS: đúng kết quả, đúng thời điểm

[Mục lục](../README.md) · [← Bài 03](03-kien-truc-linux.md) · [Bài 05 →](05-cai-dat-va-lab.md)

## Mục tiêu và liên hệ

Từ kiến trúc bài 03, hiểu vì sao mục tiêu thiết kế hệ điều hành ảnh hưởng thời gian đáp ứng. Đây là nền tảng cho bài 18–20; chưa cần chạy task ưu tiên real-time.

## 1. Real-time nghĩa là gì?

Một hệ thống real-time cần kết quả đúng trong giới hạn thời gian đã xác định. Deadline là mốc hoàn thành, latency là thời gian đáp ứng, jitter là độ biến thiên thời gian. Giá trị trung bình tốt không nói được tình huống xấu nhất.

- **Hard real-time:** vi phạm deadline là không chấp nhận được theo yêu cầu hệ thống, như một số vòng điều khiển an toàn.
- **Firm real-time:** kết quả đến muộn không còn giá trị; có thể cho phép một tỷ lệ bỏ lỡ xác định.
- **Soft real-time:** đến muộn làm giảm chất lượng, như giật âm thanh hoặc hình ảnh.

Phân loại thuộc yêu cầu cụ thể, không tự động thuộc tên sản phẩm. Một thiết bị có thể đồng thời có task hard real-time và giao diện không real-time.

## 2. Vì sao hệ điều hành thông dụng có jitter?

Task có thể đợi CPU, page fault, khóa, I/O, interrupt hoặc hoạt động firmware. Cache và quản lý điện năng làm thời gian thực thi thay đổi. Scheduler ưu tiên cao chỉ xử lý một phần đường đi; nếu task chờ thiết bị không có giới hạn đáp ứng, ưu tiên CPU không giải quyết được.

Linux cung cấp hệ sinh thái và tính năng phong phú. RTOS thường tập trung tài nguyên nhỏ và đường thực thi có thể phân tích, nhưng vẫn cần thiết kế task, kiểm soát thời gian giữ khóa và đo trên phần cứng đích. MMU không phải ranh giới định nghĩa Linux/RTOS; tồn tại nhiều cấu hình phần cứng và hệ thống khác nhau.

| Yêu cầu | Hướng cân nhắc |
|---|---|
| API web, nhiều ứng dụng, cập nhật từ xa | Linux thường thuận tiện |
| MCU nhỏ, vòng điều khiển với deadline rõ | RTOS hoặc bare metal tùy độ phức tạp |
| UI phong phú kèm vòng điều khiển chặt | Có thể tách Linux và MCU/RTOS |
| Ứng dụng cần jitter thấp trên Linux | Đánh giá kernel, PREEMPT_RT, driver và phần cứng |

## 3. Lab tư duy: lập ngân sách thời gian

Giả sử vòng điều khiển có deadline 1 ms. Đọc cảm biến mất tối đa 150 µs, tính toán 250 µs, xuất lệnh 100 µs. Còn 500 µs cho chờ lập lịch, interrupt, khóa và dự phòng. Nếu một I/O có thể chờ 2 ms, ngân sách đã thất bại dù tính toán rất nhanh.

Lập bảng cho ba hệ thống: web server, máy phát âm thanh và điều khiển động cơ. Với mỗi hệ, ghi deadline, hậu quả trễ, dữ liệu cần đo, và phần việc có thể tách sang bộ xử lý khác. Không tự đặt con số sản phẩm thực; dùng giả định và ghi rõ chúng.

## 4. Mẹo và lỗi thường gặp

- WCET là thời gian thực thi tệ nhất dưới giả định đã nêu; giá trị lớn nhất đo được chưa chứng minh là WCET tuyệt đối.
- Đo latency trong VM hữu ích để học, nhưng hypervisor có thể tạo jitter không do guest quyết định.
- RTOS không tự bảo đảm deadline của ứng dụng sai thiết kế. PREEMPT_RT cũng không biến mọi tổ hợp phần cứng/phần mềm thành hệ hard real-time đã được chứng minh.

## 5. Tự kiểm tra

1. Throughput cao có chứng minh real-time không? **Không, cần xét deadline và phân bố thời gian.**
2. Task ưu tiên cao chờ mutex do task thấp giữ có thể bị trễ không? **Có; bài 20 sẽ học priority inversion.**
3. Đo một triệu lần không trễ có chứng minh không bao giờ trễ? **Không; cần xem phạm vi thử nghiệm và lập luận giới hạn.**

## Đọc thêm

[Zephyr scheduling](https://docs.zephyrproject.org/latest/kernel/services/scheduling/index.html) cho thấy quy tắc scheduler cụ thể của một RTOS; [PREEMPT_RT](https://docs.kernel.org/core-api/real-time/index.html) mô tả cơ chế Linux giảm các vùng không thể preempt.
