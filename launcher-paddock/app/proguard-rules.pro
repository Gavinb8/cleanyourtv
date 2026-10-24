# Keep the JS bridge's methods - R8 would otherwise strip them since nothing in Java calls them directly.
-keepclassmembers class com.gavin.paddock.PaddockBridge {
    public *;
}
