package {{package}}.network;

import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.network.NetworkEvent;

/** {{displayName}} 同步包。 */
public record {{ClassName}}Packet(String message) {
    public static void encode({{ClassName}}Packet packet, FriendlyByteBuf buffer) {
        buffer.writeUtf(packet.message());
    }

    public static {{ClassName}}Packet decode(FriendlyByteBuf buffer) {
        return new {{ClassName}}Packet(buffer.readUtf());
    }

    public static void handle({{ClassName}}Packet packet, Supplier<NetworkEvent.Context> context) {
        NetworkEvent.Context ctx = context.get();
        ctx.enqueueWork(() -> {{ClassName}}Handler.handle(packet.message()));
        ctx.setPacketHandled(true);
    }
}
