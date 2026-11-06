package {{package}}.network;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;

/** {{modid}} 的网络通道。 */
public final class ModNetwork {
    private static final String VERSION = "1";

    public static final SimpleChannel CHANNEL = NetworkRegistry.ChannelBuilder
            .named(new ResourceLocation("{{modid}}", "main"))
            .networkProtocolVersion(() -> VERSION)
            .clientAcceptedVersions(VERSION::equals)
            .serverAcceptedVersions(VERSION::equals)
            .simpleChannel();

    private ModNetwork() {}

    public static void register() {
        int id = 0;
        CHANNEL.messageBuilder({{ClassName}}Packet.class, id++)
                .encoder({{ClassName}}Packet::encode)
                .decoder({{ClassName}}Packet::decode)
                .consumerMainThread({{ClassName}}Packet::handle)
                .add();
    }

    public static void sendToPlayer(ServerPlayer player, {{ClassName}}Packet packet) {
        CHANNEL.send(PacketDistributor.PLAYER.with(() -> player), packet);
    }
}
