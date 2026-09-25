// Updated sell screen — real image picker + upload to backend

import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { productsAPI } from "@/services/api";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert, Image, KeyboardAvoidingView, Platform,
  ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CATEGORIES = ["coffee","textile","spices","crafts","food","tech","fashion","livestock","agriculture"];
const REGIONS = ["Addis Ababa","Oromia","Amhara","SNNPR","Tigray","Sidama","Afar","Somali","Harari","Dire Dawa"];

export default function SellScreen() {
  const { isLoggedIn, user } = useAuth();
  const [form, setForm] = useState({
    name: "", price: "", category: "", region: user?.region || "",
    description: "", stock: "1", phone: user?.phone || "",
  });
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoading] = useState(false);

  function update(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  // Pick images from camera or gallery
  async function pickImages() {
    if (images.length >= 5) {
      Alert.alert("Max 5 photos", "Remove a photo before adding more."); return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to upload product images."); return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5 - images.length,
    });

    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets].slice(0, 5));
    }
  }

  // Take photo with camera
  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera needed", "Allow camera access to take product photos."); return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setImages(prev => [...prev, result.assets[0]].slice(0, 5));
    }
  }

  function removeImage(index: number) {
    setImages(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!isLoggedIn) {
      Alert.alert("Sign In Required", "Please sign in to list a product.", [
        { text: "Sign In", onPress: () => router.push("/(auth)/login") },
        { text: "Cancel", style: "cancel" },
      ]); return;
    }

    if (!form.name || !form.price || !form.category || !form.description) {
      Alert.alert("Missing Info", "Fill in name, price, category and description."); return;
    }

    if (images.length === 0) {
      Alert.alert("Add Photos", "Add at least 1 product photo to help buyers."); return;
    }

    setLoading(true);

    try {
      // Build FormData — required for file uploads
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("price", form.price);
      formData.append("category", form.category);
      formData.append("region", form.region);
      formData.append("description", form.description);
      formData.append("stock", form.stock);

      // Attach each image to the form
      images.forEach((img, i) => {
        formData.append("images", {
          uri: img.uri,
          type: "image/jpeg",
          name: `product_image_${i}.jpg`,
        } as any);
      });

      const result = await productsAPI.create(formData);
      Alert.alert("🎉 Submitted!", result.message || "Product submitted for review!", [
        { text: "Go to Market", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit product. Try again.");
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.title}>List a Product</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>

          {/* ── PHOTO UPLOAD ── */}
          <View style={s.photoSection}>
            <Text style={s.label}>Product Photos * ({images.length}/5)</Text>
            <Text style={s.photoHint}>Good photos = more sales! Add up to 5 clear photos.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoRow}>
              {/* Existing images */}
              {images.map((img, i) => (
                <View key={i} style={s.photoThumb}>
                  <Image source={{ uri: img.uri }} style={s.thumbImage} />
                  {i === 0 && (
                    <View style={s.mainBadge}>
                      <Text style={s.mainBadgeText}>Main</Text>
                    </View>
                  )}
                  <TouchableOpacity style={s.removeThumb} onPress={() => removeImage(i)}>
                    <Text style={s.removeThumbText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add photo buttons */}
              {images.length < 5 && (
                <>
                  <TouchableOpacity style={s.addPhotoBtn} onPress={pickImages}>
                    <Text style={s.addPhotoIcon}>🖼️</Text>
                    <Text style={s.addPhotoText}>Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.addPhotoBtn} onPress={takePhoto}>
                    <Text style={s.addPhotoIcon}>📷</Text>
                    <Text style={s.addPhotoText}>Camera</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>

          {/* ── PRODUCT DETAILS ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Product Details</Text>

            <Text style={s.label}>Product Name *</Text>
            <TextInput style={s.input} placeholder="e.g. Yirgacheffe Coffee 1kg" placeholderTextColor="#999" value={form.name} onChangeText={v => update("name", v)} />

            <Text style={s.label}>Price (ETB) *</Text>
            <View style={s.priceRow}>
              <Text style={s.etbLabel}>ETB</Text>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="0.00" placeholderTextColor="#999" value={form.price} onChangeText={v => update("price", v)} keyboardType="numeric" />
            </View>

            <Text style={s.label}>Stock Quantity *</Text>
            <TextInput style={s.input} placeholder="How many units available?" placeholderTextColor="#999" value={form.stock} onChangeText={v => update("stock", v)} keyboardType="numeric" />

            <Text style={s.label}>Category *</Text>
            <View style={s.pillsWrap}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} style={[s.pill, form.category === cat && s.pillActive]} onPress={() => update("category", cat)}>
                  <Text style={[s.pillText, form.category === cat && s.pillTextActive]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Your Region *</Text>
            <View style={s.pillsWrap}>
              {REGIONS.map(r => (
                <TouchableOpacity key={r} style={[s.pill, form.region === r && s.pillActive]} onPress={() => update("region", r)}>
                  <Text style={[s.pillText, form.region === r && s.pillTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Contact Phone</Text>
            <TextInput style={s.input} placeholder="09XX XXX XXX" placeholderTextColor="#999" value={form.phone} onChangeText={v => update("phone", v)} keyboardType="phone-pad" />

            <Text style={s.label}>Description * (be detailed — quality, origin, usage)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Describe your product clearly. Include quality, origin, how it's made, delivery terms..."
              placeholderTextColor="#999"
              value={form.description}
              onChangeText={v => update("description", v)}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* Tips */}
          <View style={s.tipBox}>
            <Text style={s.tipTitle}>📸 Photo Tips for More Sales</Text>
            <Text style={s.tipText}>• Use natural daylight, not flash{"\n"}• Show the product from multiple angles{"\n"}• Include size reference (hand, ruler){"\n"}• Clean background (white or plain){"\n"}• First photo = main display image</Text>
          </View>

          <TouchableOpacity
            style={[s.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.submitBtnText}>
              {loading ? "Uploading photos..." : "Submit Product 🚀"}
            </Text>
          </TouchableOpacity>

          <Text style={s.note}>Products are reviewed by our team within 24 hours before going live.</Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  back: { fontSize: 18, color: Colors.primary, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  photoSection: { marginBottom: 16 },
  photoHint: { fontSize: 12, color: Colors.textLight, marginBottom: 10 },
  photoRow: { gap: 10, paddingBottom: 4 },
  photoThumb: { width: 100, height: 100, borderRadius: 12, overflow: "hidden", position: "relative" },
  thumbImage: { width: "100%", height: "100%", borderRadius: 12 },
  mainBadge: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(27,140,78,0.85)", padding: 3, alignItems: "center" },
  mainBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  removeThumb: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  removeThumbText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  addPhotoBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.bgCard },
  addPhotoIcon: { fontSize: 28 },
  addPhotoText: { fontSize: 11, color: Colors.textSecondary },
  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary, marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.textPrimary, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.textPrimary, borderWidth: 0.5, borderColor: Colors.border, marginBottom: 12 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  etbLabel: { fontSize: 15, fontWeight: "700", color: Colors.primary },
  textarea: { height: 100, paddingTop: 12 },
  pillsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 0.5, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12, fontWeight: "500", color: Colors.textSecondary },
  pillTextActive: { color: "#fff" },
  tipBox: { backgroundColor: "rgba(27,140,78,0.06)", borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 0.5, borderColor: "rgba(27,140,78,0.15)" },
  tipTitle: { fontSize: 13, fontWeight: "700", color: Colors.primary, marginBottom: 6 },
  tipText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 22 },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, height: 54, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  note: { fontSize: 12, color: Colors.textLight, textAlign: "center", lineHeight: 18 },
});