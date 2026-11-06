    public static final RegistryObject<CreativeModeTab> {{constName}}_TAB = TABS.register("{{id}}", () -> CreativeModeTab.builder()
            .title(net.minecraft.network.chat.Component.translatable("itemGroup.{{modid}}.{{id}}"))
            .icon(() -> net.minecraft.world.item.ItemStack.EMPTY)
            .displayItems((parameters, output) -> {
                // TODO: output.accept(...) 添加物品
            })
            .build());
