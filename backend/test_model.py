from ultralytics import YOLO
import cv2

# Load model
model = YOLO("models/accident_model.pt")

print("\nModel loaded successfully")
print("Classes:", model.names)

# Load image
img = cv2.imread("test.jpg")

if img is None:
    print("ERROR: Image not found")
    exit()

print("Original image shape:", img.shape)

# Resize image to common YOLO input size
img = cv2.resize(img, (640, 640))

# Run inference with lower confidence threshold
results = model(img, conf=0.05)

print("\nRaw Results:")
print(results)

# Inspect detections
for r in results:

    boxes = r.boxes

    if boxes is None or len(boxes) == 0:
        print("\nNo detections found.")
    else:
        print("\nDetections found:")
        for box in boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            coords = box.xyxy[0].tolist()

            print(f"Class: {model.names[cls]}")
            print(f"Confidence: {conf}")
            print(f"Bounding Box: {coords}\n")

# Show annotated image
annotated = results[0].plot()

cv2.imshow("Detection Result", annotated)
cv2.waitKey(0)
cv2.destroyAllWindows()