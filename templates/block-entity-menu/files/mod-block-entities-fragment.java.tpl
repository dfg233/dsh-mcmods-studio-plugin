    public static final RegistryObject<BlockEntityType<{{ClassName}}BlockEntity>> {{constName}}_BE =
            BLOCK_ENTITIES.register("{{id}}", () -> BlockEntityType.Builder.of({{ClassName}}BlockEntity::new, ModBlocks.{{constName}}_BLOCK.get()).build(null));
